import type { ExecuteReport } from "./execute";

/**
 * A record of what the real leg actually did, per (round, desk).
 *
 * This is deliberately a log of *intent and outcome*, not a second book. The arena is
 * the only thing that scores; this exists so a desk page can show the real order beside
 * the modelled one and let a reader see exactly where they diverge.
 *
 * In-memory and best-effort: a cold serverless instance starts empty, which the UI says
 * out loud rather than pretending the history is complete.
 */
export type MirrorEntry = {
  roundId: number;
  deskId: number;
  owner: string;
  side: "bid" | "ask" | "hold";
  txHash: string | null;
  error: string | null;
  at: number;
} & ExecuteReport;

type MirrorStore = { entries: MirrorEntry[]; startedAt: number };

const LIMIT = 200;
const g = globalThis as typeof globalThis & { __dreamdeskMirror?: MirrorStore };

function store(): MirrorStore {
  if (!g.__dreamdeskMirror) g.__dreamdeskMirror = { entries: [], startedAt: Date.now() };
  return g.__dreamdeskMirror;
}

export function recordMirror(entry: MirrorEntry) {
  const s = store();
  s.entries.unshift(entry);
  if (s.entries.length > LIMIT) s.entries.length = LIMIT;
}

export function readMirror(deskId?: number): { entries: MirrorEntry[]; since: number } {
  const s = store();
  const entries = deskId === undefined ? s.entries : s.entries.filter((e) => e.deskId === deskId);
  return { entries, since: s.startedAt };
}
