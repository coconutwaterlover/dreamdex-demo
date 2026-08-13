import type { Vote } from "./types";

export function voteMessage(roundId: number, choice: Vote): string {
  return `DreamDesk swarm vote\nRound: ${roundId}\nChoice: ${choice}`;
}

export function isVote(value: string): value is Vote {
  return value === "bid" || value === "ask" || value === "hold";
}

function myVoteKey(roundId: number, address: string) {
  return `dreamdesk-my-vote:${roundId}:${address.toLowerCase()}`;
}

export function persistMyVote(roundId: number, vote: Vote, address: string) {
  if (!roundId || !address) return;
  try {
    sessionStorage.setItem(myVoteKey(roundId, address), vote);
  } catch {
    // private mode
  }
}

export function restoreMyVote(roundId: number, address?: string): Vote | null {
  if (!roundId || !address) return null;
  try {
    const raw = sessionStorage.getItem(myVoteKey(roundId, address));
    return raw && isVote(raw) ? raw : null;
  } catch {
    return null;
  }
}
