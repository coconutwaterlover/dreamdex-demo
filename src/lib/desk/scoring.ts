import type { Vote, Voter } from "./types";

/** Day-1 theater: flat ±pts. `mid0`/`mid1` are recorded for Day-3 lagged mark-to-mid. */
export function scoreVoters(
  voters: Voter[],
  winner: Vote,
  _window: { mid0: number; mid1: number; traded: boolean },
): Voter[] {
  const next = voters.map((u) => {
    if (!u.vote) return { ...u, delta: 0 };
    let delta = 0;
    if (winner === "hold") {
      delta = 2;
    } else if (u.vote === winner) {
      delta = 10;
    } else if (u.vote === "hold") {
      delta = 0;
    } else {
      delta = -6;
    }
    return { ...u, pts: u.pts + delta, delta };
  });
  return [...next].sort((a, b) => b.pts - a.pts);
}
