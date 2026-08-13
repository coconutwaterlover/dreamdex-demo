import type { Vote, Voter } from "./types";

export function scoreDelta(vote: Vote | undefined, winner: Vote): number {
  if (!vote) return 0;
  if (winner === "hold") return 2;
  if (vote === winner) return 10;
  if (vote === "hold") return 0;
  return -6;
}

/** Day-1 theater: flat ±pts. `mid0`/`mid1` are recorded for Day-3 lagged mark-to-mid. */
export function scoreVoters(
  voters: Voter[],
  winner: Vote,
  _window: { mid0: number; mid1: number; traded: boolean },
): Voter[] {
  const next = voters.map((u) => {
    const delta = u.vote ? scoreDelta(u.vote, winner) : 0;
    return { ...u, pts: u.pts + delta, delta };
  });
  return [...next].sort((a, b) => b.pts - a.pts);
}
