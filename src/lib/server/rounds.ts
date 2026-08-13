import type { Address } from "viem";
import { HOUSE_OWNER_ADDRESS, OPERATOR_REGISTRY, PLACE_ORDER_FOR, SESSION_ADDRESS, isDeskBadgeConfigured } from "@/lib/chain/constants";
import { operatorRegistryAbi } from "@/lib/chain/abi";
import { normalizePlayerName } from "@/lib/desk/name";
import { ROUND_SECONDS, tallyWinner } from "@/lib/desk/round";
import { scoreDelta } from "@/lib/desk/scoring";
import type { RoundBallot, RoundSnapshot, ScoreDelta, Vote, VoteTally } from "@/lib/desk/types";
import { hasBadge, readBoard, syncBoard } from "./badge";
import { executeResolvedVote } from "./execute";
import { fetchMarketQuote } from "./market";
import { reactivityHasFired, scheduleRoundEnd, watchRoundFired } from "./reactivity";
import { getPublicClient } from "./session";

export type RoundStatus = RoundSnapshot["status"];

type StoredBallot = { vote: Vote; name?: string };

type StoredRound = {
  id: number;
  status: Exclude<RoundStatus, "idle">;
  openedAt: number;
  endsAt: number;
  votes: Map<string, StoredBallot>;
  winner: Vote | null;
  txHash: string | null;
  error: string | null;
  subscriptionId: bigint | null;
  scheduleTxHash: string | null;
  fireCountAtOpen: bigint;
  executed: boolean;
  badgeTxHash: string | null;
  badgeError: string | null;
  minted: string[];
  scoreDeltas: ScoreDelta[];
  badgeSynced: boolean;
};

type RoundStore = {
  seq: number;
  current: StoredRound | null;
  names: Map<string, string>;
  resolveLock: Promise<RoundSnapshot> | null;
  unwatch: (() => void) | null;
};

const g = globalThis as typeof globalThis & { __dreamdeskRounds?: RoundStore };

function store(): RoundStore {
  if (!g.__dreamdeskRounds) {
    g.__dreamdeskRounds = {
      seq: 0,
      current: null,
      names: new Map(),
      resolveLock: null,
      unwatch: null,
    };
  }
  return g.__dreamdeskRounds;
}

function stopWatcher() {
  const s = store();
  s.unwatch?.();
  s.unwatch = null;
}

function tallyOf(votes: Map<string, StoredBallot>): VoteTally {
  const tally: VoteTally = { bid: 0, ask: 0, hold: 0 };
  for (const b of votes.values()) tally[b.vote] += 1;
  return tally;
}

function remainingOf(round: StoredRound): number {
  return Math.max(0, Math.ceil((round.endsAt - Date.now()) / 1000));
}

function ballotsOf(round: StoredRound): RoundBallot[] {
  return [...round.votes.entries()].map(([address, b]) => ({
    address,
    vote: b.vote,
    name: b.name ?? store().names.get(address),
  }));
}

function emptyBadgeFields() {
  return {
    badgeTxHash: null as string | null,
    badgeError: null as string | null,
    minted: [] as string[],
    scoreDeltas: [] as ScoreDelta[],
  };
}

async function snapshot(round: StoredRound | null): Promise<RoundSnapshot> {
  const quote = await fetchMarketQuote();
  if (!round) {
    return {
      id: null,
      status: "idle",
      endsAt: null,
      remaining: 0,
      tally: { bid: 0, ask: 0, hold: 0 },
      ballots: [],
      winner: null,
      txHash: null,
      error: null,
      mid: quote.last,
      subscriptionId: null,
      scheduleTxHash: null,
      ...emptyBadgeFields(),
    };
  }
  return {
    id: round.id,
    status: round.status,
    endsAt: round.endsAt,
    remaining: remainingOf(round),
    tally: tallyOf(round.votes),
    ballots: ballotsOf(round),
    winner: round.winner,
    txHash: round.txHash,
    error: round.error,
    mid: quote.last,
    subscriptionId: round.subscriptionId?.toString() ?? null,
    scheduleTxHash: round.scheduleTxHash,
    badgeTxHash: round.badgeTxHash,
    badgeError: round.badgeError,
    minted: round.minted,
    scoreDeltas: round.scoreDeltas,
  };
}

async function roundIsDue(round: StoredRound): Promise<boolean> {
  if (round.status !== "voting") return false;
  if (Date.now() + 2000 < round.endsAt) return false;
  return reactivityHasFired({
    subscriptionId: round.subscriptionId,
    fireCountAtOpen: round.fireCountAtOpen,
    endsAt: round.endsAt,
  });
}

export async function getRoundSnapshot(): Promise<RoundSnapshot> {
  const current = store().current;
  if (current?.status === "voting" && (await roundIsDue(current))) {
    return resolveRound();
  }
  return snapshot(current);
}

export async function deskIsArmed(): Promise<boolean> {
  if (!HOUSE_OWNER_ADDRESS || !SESSION_ADDRESS) return false;
  const client = getPublicClient();
  return client.readContract({
    address: OPERATOR_REGISTRY,
    abi: operatorRegistryAbi,
    functionName: "isGloballyApproved",
    args: [HOUSE_OWNER_ADDRESS, SESSION_ADDRESS, PLACE_ORDER_FOR],
  });
}

export async function openRound(): Promise<RoundSnapshot> {
  const s = store();
  if (s.current?.status === "voting") {
    if (await roundIsDue(s.current)) {
      await resolveRound();
    } else {
      return snapshot(s.current);
    }
  }
  const armed = await deskIsArmed();
  if (!armed) {
    throw new Error("Desk is not armed on-chain");
  }
  const openedAt = Date.now();
  const endsAt = openedAt + ROUND_SECONDS * 1000;
  const scheduled = await scheduleRoundEnd(endsAt);
  stopWatcher();
  s.seq += 1;
  s.current = {
    id: s.seq,
    status: "voting",
    openedAt,
    endsAt,
    votes: new Map(),
    winner: null,
    txHash: null,
    error: null,
    subscriptionId: scheduled.subscriptionId,
    scheduleTxHash: scheduled.txHash,
    fireCountAtOpen: scheduled.fireCount,
    executed: false,
    ...emptyBadgeFields(),
    badgeSynced: false,
  };
  s.unwatch = watchRoundFired(() => {
    void resolveRound().catch((err) => console.error("[reactivity]", err));
  });
  return snapshot(s.current);
}

export async function castBallot(
  roundId: number,
  address: string,
  vote: Vote,
  rawName?: string,
): Promise<RoundSnapshot> {
  const s = store();
  const { current } = s;
  if (!current || current.id !== roundId) throw new Error("Round not found");
  if (current.status !== "voting") throw new Error("Round is not open for votes");
  if (Date.now() >= current.endsAt) throw new Error("Round has locked");
  const key = address.toLowerCase();
  if (current.votes.has(key)) throw new Error("Already voted this round");

  const name = normalizePlayerName(rawName) ?? s.names.get(key);
  const known = !!s.names.get(key) || (isDeskBadgeConfigured() && (await hasBadge(address as Address)));
  if (isDeskBadgeConfigured() && !known && !name) {
    throw new Error("Pick a display name for your badge (3–24 letters, numbers, . _ -)");
  }
  if (name) s.names.set(key, name);

  current.votes.set(key, { vote, name: name ?? s.names.get(key) });
  return snapshot(current);
}

async function syncBadges(current: StoredRound, winner: Vote): Promise<void> {
  if (current.badgeSynced || current.votes.size === 0) {
    current.badgeSynced = true;
    return;
  }
  try {
    const board = await readBoard();
    const byWallet = new Map(board.map((row) => [row.wallet.toLowerCase(), row]));
    const names = store().names;
    const players: { wallet: Address; name: string; score: number; isNew: boolean; delta: number }[] = [];

    for (const [addr, ballot] of current.votes) {
      const existing = byWallet.get(addr);
      const handle = ballot.name ?? names.get(addr) ?? existing?.name ?? "";
      if (!existing && !handle) continue;
      const delta = scoreDelta(ballot.vote, winner);
      const prev = existing?.score ?? 0;
      players.push({
        wallet: addr as Address,
        name: handle,
        score: prev + delta,
        isNew: !existing,
        delta,
      });
    }

    if (!players.length) {
      current.badgeSynced = true;
      return;
    }

    const result = await syncBoard(players);
    current.badgeSynced = true;
    current.badgeTxHash = result.txHash;
    current.badgeError = result.error ?? null;
    current.minted = result.minted.map((a) => a.toLowerCase());
    const after = result.txHash ? await readBoard().catch(() => board) : board;
    const afterMap = new Map(after.map((row) => [row.wallet.toLowerCase(), row]));
    current.scoreDeltas = players.map((p) => {
      const row = afterMap.get(p.wallet.toLowerCase());
      return {
        address: p.wallet.toLowerCase(),
        name: row?.name || p.name,
        delta: p.delta,
        pts: row?.score ?? p.score,
        tokenId: row?.tokenId ?? null,
      };
    });
    for (const minted of current.minted) {
      const row = afterMap.get(minted);
      if (row?.name) names.set(minted, row.name);
    }
  } catch (err) {
    current.badgeSynced = true;
    current.badgeError = err instanceof Error ? err.message : "Badge sync failed";
  }
}

export async function resolveRound(): Promise<RoundSnapshot> {
  const s = store();
  if (s.resolveLock) return s.resolveLock;
  s.resolveLock = (async () => {
    try {
      const current = s.current;
      if (!current) throw new Error("No round to resolve");
      if (current.status === "scored" || current.status === "blocked") return snapshot(current);
      if (current.status === "voting") {
        const due = await roundIsDue(current);
        if (!due && Date.now() < current.endsAt) return snapshot(current);
      }
      stopWatcher();
      current.status = "resolving";
      const winner = current.votes.size === 0 ? "hold" : tallyWinner(tallyOf(current.votes));
      current.winner = winner;

      if (!current.executed) {
        const result = await executeResolvedVote(winner);
        current.executed = true;
        if (result.ok && result.skipped) {
          // hold — no order
        } else if (result.ok) {
          current.txHash = result.txHash;
        } else if (result.blocked) {
          current.error = result.error;
          await syncBadges(current, winner);
          current.status = "blocked";
          return snapshot(current);
        } else {
          current.error = result.error;
        }
      }

      await syncBadges(current, winner);
      current.status = "scored";
      return snapshot(current);
    } finally {
      s.resolveLock = null;
    }
  })();
  return s.resolveLock;
}
