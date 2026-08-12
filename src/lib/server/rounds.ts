import { HOUSE_OWNER_ADDRESS, OPERATOR_REGISTRY, PLACE_ORDER_FOR, SESSION_ADDRESS } from "@/lib/chain/constants";
import { operatorRegistryAbi } from "@/lib/chain/abi";
import { ROUND_SECONDS, tallyWinner } from "@/lib/desk/round";
import type { RoundSnapshot, Vote, VoteTally } from "@/lib/desk/types";
import { executeResolvedVote } from "./execute";
import { fetchMarketQuote } from "./market";
import { getPublicClient } from "./session";

export type RoundStatus = RoundSnapshot["status"];

type StoredRound = {
  id: number;
  status: Exclude<RoundStatus, "idle">;
  openedAt: number;
  endsAt: number;
  votes: Map<string, Vote>;
  winner: Vote | null;
  txHash: string | null;
  error: string | null;
};

type RoundStore = {
  seq: number;
  current: StoredRound | null;
  resolveLock: Promise<RoundSnapshot> | null;
};

const g = globalThis as typeof globalThis & { __dreamdeskRounds?: RoundStore };

function store(): RoundStore {
  if (!g.__dreamdeskRounds) {
    g.__dreamdeskRounds = { seq: 0, current: null, resolveLock: null };
  }
  return g.__dreamdeskRounds;
}

function tallyOf(votes: Map<string, Vote>): VoteTally {
  const tally: VoteTally = { bid: 0, ask: 0, hold: 0 };
  for (const v of votes.values()) tally[v] += 1;
  return tally;
}

function remainingOf(round: StoredRound): number {
  return Math.max(0, Math.ceil((round.endsAt - Date.now()) / 1000));
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
    };
  }
  return {
    id: round.id,
    status: round.status,
    endsAt: round.endsAt,
    remaining: remainingOf(round),
    tally: tallyOf(round.votes),
    ballots: [...round.votes.entries()].map(([address, vote]) => ({ address, vote })),
    winner: round.winner,
    txHash: round.txHash,
    error: round.error,
    mid: quote.last,
  };
}

export async function getRoundSnapshot(): Promise<RoundSnapshot> {
  return snapshot(store().current);
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
  if (s.current?.status === "voting" && Date.now() < s.current.endsAt) {
    return snapshot(s.current);
  }
  if (s.current?.status === "voting" && Date.now() >= s.current.endsAt) {
    await resolveRound();
  }
  const armed = await deskIsArmed();
  if (!armed) {
    throw new Error("Desk is not armed on-chain");
  }
  s.seq += 1;
  const openedAt = Date.now();
  s.current = {
    id: s.seq,
    status: "voting",
    openedAt,
    endsAt: openedAt + ROUND_SECONDS * 1000,
    votes: new Map(),
    winner: null,
    txHash: null,
    error: null,
  };
  return snapshot(s.current);
}

export function castBallot(roundId: number, address: string, vote: Vote): RoundSnapshot {
  const { current } = store();
  if (!current || current.id !== roundId) throw new Error("Round not found");
  if (current.status !== "voting") throw new Error("Round is not open for votes");
  if (Date.now() >= current.endsAt) throw new Error("Round has locked");
  const key = address.toLowerCase();
  if (current.votes.has(key)) throw new Error("Already voted this round");
  current.votes.set(key, vote);
  return {
    id: current.id,
    status: current.status,
    endsAt: current.endsAt,
    remaining: remainingOf(current),
    tally: tallyOf(current.votes),
    ballots: [...current.votes.entries()].map(([addr, v]) => ({ address: addr, vote: v })),
    winner: current.winner,
    txHash: current.txHash,
    error: current.error,
    mid: 0,
  };
}

export async function resolveRound(): Promise<RoundSnapshot> {
  const s = store();
  if (s.resolveLock) return s.resolveLock;
  s.resolveLock = (async () => {
    try {
      const current = s.current;
      if (!current) throw new Error("No round to resolve");
      if (current.status === "scored" || current.status === "blocked") return snapshot(current);
      if (current.status === "voting" && Date.now() < current.endsAt) {
        return snapshot(current);
      }
      if (current.txHash) {
        current.status = "scored";
        return snapshot(current);
      }
      current.status = "resolving";
      const winner = current.votes.size === 0 ? "hold" : tallyWinner(tallyOf(current.votes));
      current.winner = winner;
      const result = await executeResolvedVote(winner);
      if (result.ok && result.skipped) {
        current.status = "scored";
        return snapshot(current);
      }
      if (result.ok) {
        current.txHash = result.txHash;
        current.status = "scored";
        return snapshot(current);
      }
      if (result.blocked) {
        current.status = "blocked";
        current.error = result.error;
        return snapshot(current);
      }
      current.status = "scored";
      current.error = result.error;
      return snapshot(current);
    } finally {
      s.resolveLock = null;
    }
  })();
  return s.resolveLock;
}
