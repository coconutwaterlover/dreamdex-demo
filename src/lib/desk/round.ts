import type { Vote, VoteTally, Voter } from "./types";

/** Demo compresses 5:00 → 60s, scheduled on-chain via Somnia Reactivity */
export const ROUND_SECONDS = 60;
export const INITIAL_MID = 0.0875;
export const MOCK_TX = "0xf3a91c…8e2b";

export const SEED_VOTERS: Voter[] = [
  { id: "you", name: "You", pts: 40 },
  { id: "mango", name: "mango.eth", pts: 70 },
  { id: "kiwi", name: "kiwi", pts: 55 },
  { id: "lychee", name: "lychee", pts: 48 },
  { id: "papaya", name: "papaya", pts: 33 },
  { id: "berry", name: "berry", pts: 22 },
];

export const EMPTY_TALLY: VoteTally = { bid: 0, ask: 0, hold: 0 };

export function tallyWinner(v: VoteTally): Vote {
  const max = Math.max(v.bid, v.ask, v.hold);
  const tied = (["bid", "ask", "hold"] as Vote[]).filter((k) => v[k] === max);
  if (tied.length > 1) return "hold";
  return tied[0];
}

export function pickCrowdVote(): Vote {
  return Math.random() < 0.55 ? "bid" : Math.random() < 0.6 ? "ask" : "hold";
}

export function cloneSeedVoters(): Voter[] {
  return SEED_VOTERS.map((v) => ({ ...v }));
}

export function stamp(): string {
  const d = new Date();
  return `${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export function shortAddress(addr: string): string {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
