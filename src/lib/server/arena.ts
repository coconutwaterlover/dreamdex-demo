import { formatUnits, type Address } from "viem";
import { deskArenaAbi } from "@/lib/chain/arena-abi";
import { arenaBadgeAbi } from "@/lib/chain/arena-badge-abi";
import { arenaClockAbi } from "@/lib/chain/arena-clock-abi";
import {
  ARENA_ADDRESS,
  ARENA_CLOCK_ADDRESS,
  CONTRIBUTOR_BADGE_ADDRESS,
  DESK_BADGE_ADDRESS,
  OPERATOR_REGISTRY,
  ROUND_SECONDS,
  SOMI_USDSO_POOL,
  isArenaConfigured,
  isClockConfigured,
} from "@/lib/chain/constants";
import type { ArenaSnapshot, ContributorRow, DeskRow } from "@/lib/arena/types";
import { getPublicClient } from "./session";

const E6 = 1_000_000;
/** Every desk opens on the same book, so profit is equity minus this. */
const START_CASH = 1000;

function toUsd(value: bigint): number {
  return Number(value) / E6;
}

function emptyState(): ArenaSnapshot["state"] {
  const now = Math.floor(Date.now() / 1000);
  const roundId = Math.floor(now / ROUND_SECONDS);
  return {
    roundId,
    endsAt: (roundId + 1) * ROUND_SECONDS,
    lastTickedRound: roundId,
    mid: 0,
    season: 0,
    seasonRound: 0,
    deskCount: 0,
    voterCount: 0,
    createBondWei: "0",
    sessionKey: "",
    behind: false,
  };
}

export function emptySnapshot(): ArenaSnapshot {
  return {
    configured: false,
    state: emptyState(),
    desks: [],
    contributors: [],
    clock: null,
    addresses: {
      arena: null,
      deskBadge: null,
      contributorBadge: null,
      pool: SOMI_USDSO_POOL,
      registry: OPERATOR_REGISTRY,
    },
  };
}

const PAGE = BigInt(250);
/** Board getters are paginated on-chain; walk them so a full board is never truncated. */
async function readAllPages<T>(read: (offset: bigint, limit: bigint) => Promise<readonly T[]>) {
  const all: T[] = [];
  for (let offset = BigInt(0); ; offset += PAGE) {
    const page = await read(offset, PAGE);
    all.push(...page);
    if (page.length < Number(PAGE)) return all;
  }
}

/** Desks rank on profit; retired desks keep their number but sink below the living. */
function rankDesks(rows: Omit<DeskRow, "rank">[]): DeskRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.retired !== b.retired) return a.retired ? 1 : -1;
    if (b.pnl !== a.pnl) return b.pnl - a.pnl;
    return a.deskId - b.deskId;
  });
  return sorted.map((row, i) => ({ ...row, rank: i + 1 }));
}

function rankContributors(rows: Omit<ContributorRow, "rank">[]): ContributorRow[] {
  const sorted = [...rows].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.bestStreak !== a.bestStreak) return b.bestStreak - a.bestStreak;
    return b.ballotsCast - a.ballotsCast;
  });
  return sorted.map((row, i) => ({ ...row, rank: i + 1 }));
}

export async function readArena(): Promise<ArenaSnapshot> {
  if (!isArenaConfigured() || !ARENA_ADDRESS) return emptySnapshot();
  const client = getPublicClient();
  const address: Address = ARENA_ADDRESS;
  const arena = { address, abi: deskArenaAbi } as const;

  const state = await client.readContract({ ...arena, functionName: "arenaState" });
  const roundId = state.roundId;

  const [rawDesks, rawContributors] = await Promise.all([
    client.readContract({ ...arena, functionName: "deskBoard", args: [roundId] }),
    readAllPages((offset, limit) =>
      client.readContract({ ...arena, functionName: "contributorBoard", args: [offset, limit] }),
    ),
  ]);

  const desks = rankDesks(
    rawDesks.map((d) => {
      // The contract's pnlE6 is the value settled at the last boundary; equityE6 is
      // already marked to the live book. Rank on the live number so a desk's profit
      // moves with the market instead of freezing between rounds.
      const settled = toUsd(d.pnlE6);
      const equity = toUsd(d.equityE6);
      const pnl = equity - START_CASH;
      return {
      deskId: Number(d.deskId),
      owner: d.owner,
      name: d.name,
      cash: toUsd(d.cashE6),
      base: toUsd(d.baseE6),
      pnl,
      seasonPnl: toUsd(d.seasonPnlE6) + (pnl - settled),
      equity,
      createdRound: Number(d.createdRound),
      roundsTraded: d.roundsTraded,
      wins: d.wins,
      armed: d.armed,
      wantsLive: d.wantsLive,
      retired: d.retired,
      tally: { bid: d.bid, ask: d.ask, hold: d.hold },
      votes: d.bid + d.ask + d.hold,
      };
    }),
  );

  // Handles live on the contributor badge, so pull them in one board read.
  const handles = new Map<string, { handle: string; tokenId: number }>();
  if (CONTRIBUTOR_BADGE_ADDRESS) {
    try {
      const badgeAddress: Address = CONTRIBUTOR_BADGE_ADDRESS;
      const badges = await readAllPages((offset, limit) =>
        client.readContract({
          address: badgeAddress,
          abi: arenaBadgeAbi,
          functionName: "board",
          args: [offset, limit],
        }),
      );
      for (const b of badges) {
        handles.set(b.wallet.toLowerCase(), { handle: b.handle, tokenId: Number(b.tokenId) });
      }
    } catch {
      // badge not deployed yet — fall back to short addresses
    }
  }

  const contributors = rankContributors(
    rawContributors.map((c) => {
      const badge = handles.get(c.wallet.toLowerCase());
      return {
        wallet: c.wallet,
        handle: badge?.handle ?? "",
        tokenId: badge?.tokenId ?? null,
        points: Number(c.points),
        seasonPoints: Number(c.seasonPoints),
        ballotsCast: c.ballotsCast,
        roundsScored: c.roundsScored,
        streak: c.streak,
        bestStreak: c.bestStreak,
        lastVotedRound: Number(c.lastVotedRound),
        pending: Number(c.pending),
      };
    }),
  );

  let clock: ArenaSnapshot["clock"] = null;
  if (isClockConfigured() && ARENA_CLOCK_ADDRESS) {
    try {
      const clockAddress: Address = ARENA_CLOCK_ADDRESS;
      const c = { address: clockAddress, abi: arenaClockAbi } as const;
      const [fireCount, lastFiredAtMs, armedForMs, subscriptionId, balance] = await Promise.all([
        client.readContract({ ...c, functionName: "fireCount" }),
        client.readContract({ ...c, functionName: "lastFiredAtMs" }),
        client.readContract({ ...c, functionName: "armedForMs" }),
        client.readContract({ ...c, functionName: "subscriptionId" }),
        client.getBalance({ address: ARENA_CLOCK_ADDRESS }),
      ]);
      clock = {
        address: ARENA_CLOCK_ADDRESS,
        fireCount: Number(fireCount),
        lastFiredAtMs: Number(lastFiredAtMs),
        armedForMs: Number(armedForMs),
        subscriptionId: subscriptionId.toString(),
        balance: formatUnits(balance, 18),
        funded: balance >= BigInt(32) * BigInt(1e18),
      };
    } catch {
      clock = null;
    }
  }

  return {
    configured: true,
    state: {
      roundId: Number(state.roundId),
      endsAt: Number(state.endsAt),
      lastTickedRound: Number(state.lastTickedRound),
      mid: Number(formatUnits(state.mid, 18)),
      season: Number(state.season),
      seasonRound: Number(state.seasonRound),
      deskCount: Number(state.deskCount),
      voterCount: Number(state.voterCount),
      createBondWei: state.createBond.toString(),
      sessionKey: state.sessionKey,
      behind: state.lastTickedRound < state.roundId,
    },
    desks,
    contributors,
    clock,
    addresses: {
      arena: ARENA_ADDRESS,
      deskBadge: DESK_BADGE_ADDRESS ?? null,
      contributorBadge: CONTRIBUTOR_BADGE_ADDRESS ?? null,
      pool: SOMI_USDSO_POOL,
      registry: OPERATOR_REGISTRY,
    },
  };
}

/** A wallet's own ballots for the round in play, so the UI can show what it already sent. */
export async function readMyVotes(voter: Address, roundId: number, deskCount: number) {
  if (!isArenaConfigured() || !ARENA_ADDRESS || deskCount === 0) return {} as Record<number, number>;
  const arenaAddress: Address = ARENA_ADDRESS;
  const client = getPublicClient();
  const ids = Array.from({ length: deskCount }, (_, i) => i);
  const votes = await Promise.all(
    ids.map((deskId) =>
      client
        .readContract({
          address: arenaAddress,
          abi: deskArenaAbi,
          functionName: "myVote",
          args: [BigInt(roundId), BigInt(deskId), voter],
        })
        .catch(() => 0),
    ),
  );
  const out: Record<number, number> = {};
  votes.forEach((v, i) => {
    if (v) out[i] = Number(v);
  });
  return out;
}
