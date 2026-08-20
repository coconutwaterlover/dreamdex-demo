import type { Address } from "viem";
import { deskArenaAbi } from "@/lib/chain/arena-abi";
import { arenaClockAbi } from "@/lib/chain/arena-clock-abi";
import {
  ARENA_ADDRESS,
  ARENA_CLOCK_ADDRESS,
  isArenaConfigured,
  isClockConfigured,
} from "@/lib/chain/constants";
import { executeDeskMove } from "./execute";
import { recordMirror } from "./mirror";
import { getPublicClient, isExecutorConfigured, writeSessionContract } from "./session";

export type KeeperReport = {
  ranAt: number;
  ticked: boolean;
  tickTxHash: string | null;
  rearmed: boolean;
  rearmTxHash: string | null;
  roundId: number;
  lastTickedRound: number;
  mirrored: {
    deskId: number;
    owner: string;
    side: string;
    txHash: string | null;
    error: string | null;
    intendedPriceE18: string | null;
    placedPriceE18: string | null;
    slipBps: number | null;
    repriced: boolean;
  }[];
  notes: string[];
};

type KeeperMemory = { mirrored: Set<string>; lastRun: number; running: Promise<KeeperReport> | null };

const g = globalThis as typeof globalThis & { __dreamdeskKeeper?: KeeperMemory };

function memory(): KeeperMemory {
  if (!g.__dreamdeskKeeper) g.__dreamdeskKeeper = { mirrored: new Set(), lastRun: 0, running: null };
  return g.__dreamdeskKeeper;
}

const CHOICE: Record<number, "bid" | "ask" | "hold"> = { 1: "bid", 2: "ask", 3: "hold" };

/**
 * Advances the arena and mirrors armed desks onto the real book.
 *
 * Nothing here is load-bearing for correctness: the ArenaClock ticks on its own and
 * `tick()` is idempotent. The keeper exists to heal a dropped callback and to place
 * the real DreamDEX orders, which a contract cannot do on an owner's behalf.
 */
export async function runKeeper(): Promise<KeeperReport> {
  const mem = memory();
  if (mem.running) return mem.running;
  mem.running = keeperPass().finally(() => {
    mem.running = null;
  });
  return mem.running;
}

async function keeperPass(): Promise<KeeperReport> {
  const mem = memory();
  const report: KeeperReport = {
    ranAt: Date.now(),
    ticked: false,
    tickTxHash: null,
    rearmed: false,
    rearmTxHash: null,
    roundId: 0,
    lastTickedRound: 0,
    mirrored: [],
    notes: [],
  };

  if (!isArenaConfigured() || !ARENA_ADDRESS) {
    report.notes.push("Arena address not configured");
    return report;
  }

  const client = getPublicClient();
  const arenaAddress: Address = ARENA_ADDRESS;
  const arena = { address: arenaAddress, abi: deskArenaAbi } as const;
  const state = await client.readContract({ ...arena, functionName: "arenaState" });
  report.roundId = Number(state.roundId);
  report.lastTickedRound = Number(state.lastTickedRound);

  if (!isExecutorConfigured()) {
    report.notes.push("SESSION_PRIVATE_KEY is not set — read-only keeper");
    return report;
  }

  // 1. Heal the clock if a callback was dropped.
  if (state.lastTickedRound < state.roundId) {
    try {
      report.tickTxHash = await writeSessionContract({ ...arena, functionName: "tick", args: [] });
      report.ticked = true;
      report.lastTickedRound = report.roundId;
    } catch (err) {
      report.notes.push(`tick failed: ${message(err)}`);
    }
  }

  // 2. Make sure the on-chain heartbeat is still armed for a future boundary.
  if (isClockConfigured() && ARENA_CLOCK_ADDRESS) {
    try {
      const clockAddress: Address = ARENA_CLOCK_ADDRESS;
      const clock = { address: clockAddress, abi: arenaClockAbi } as const;
      const [armedForMs, balance] = await Promise.all([
        client.readContract({ ...clock, functionName: "armedForMs" }),
        client.getBalance({ address: clockAddress }),
      ]);
      if (balance < BigInt(32) * BigInt(1e18)) {
        report.notes.push("Clock balance is below the 32 STT Reactivity bond — top it up with fund()");
      } else if (Number(armedForMs) < Date.now()) {
        report.rearmTxHash = await writeSessionContract({ ...clock, functionName: "rearm", args: [] });
        report.rearmed = true;
      }
    } catch (err) {
      report.notes.push(`rearm skipped: ${message(err)}`);
    }
  }

  // 3. Mirror the round that just closed for every armed desk.
  const closing = report.lastTickedRound - 1;
  if (closing > 0) {
    // The arena settled the paper book for `closing` at the mid that opened the round
    // after it. Pricing the real order from that same number is what keeps the two legs
    // describing one intent rather than two.
    let intendedMid: bigint | undefined;
    try {
      intendedMid = await client.readContract({
        ...arena,
        functionName: "roundMid",
        args: [BigInt(report.lastTickedRound)],
      });
      if (intendedMid === BigInt(0)) intendedMid = undefined;
    } catch {
      intendedMid = undefined;
    }

    let desks: readonly { deskId: bigint; owner: Address; armed: boolean; retired: boolean }[] = [];
    try {
      desks = await client.readContract({ ...arena, functionName: "deskBoard", args: [BigInt(closing)] });
    } catch (err) {
      report.notes.push(`deskBoard read failed: ${message(err)}`);
    }

    for (const desk of desks) {
      if (!desk.armed || desk.retired) continue;
      const deskId = Number(desk.deskId);
      const key = `${closing}:${deskId}`;
      if (mem.mirrored.has(key)) continue;

      let winner = 3;
      try {
        winner = Number(
          await client.readContract({
            ...arena,
            functionName: "winnerOf",
            args: [BigInt(closing), desk.deskId],
          }),
        );
      } catch {
        continue;
      }
      const side = CHOICE[winner];
      if (side !== "bid" && side !== "ask") {
        mem.mirrored.add(key);
        continue;
      }

      const result = await executeDeskMove(desk.owner, side, intendedMid);
      mem.mirrored.add(key);
      const entry = {
        roundId: closing,
        deskId,
        owner: desk.owner,
        side,
        txHash: result.ok && !result.skipped ? result.txHash : null,
        error: result.ok ? null : result.error,
        at: Date.now(),
        ...result.report,
      };
      recordMirror(entry);
      report.mirrored.push({
        deskId,
        owner: desk.owner,
        side,
        txHash: entry.txHash,
        error: entry.error,
        intendedPriceE18: entry.intendedPriceE18,
        placedPriceE18: entry.placedPriceE18,
        slipBps: entry.slipBps,
        repriced: entry.repriced,
      });
    }
  }

  // Keep the dedupe set from growing without bound across a long-lived instance.
  if (mem.mirrored.size > 2000) mem.mirrored.clear();
  mem.lastRun = Date.now();
  return report;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message.split("\n")[0] : String(err);
}
