import type { Vote } from "./types";

export function voteMessage(roundId: number, choice: Vote): string {
  return `DreamDesk swarm vote\nRound: ${roundId}\nChoice: ${choice}`;
}

export function isVote(value: string): value is Vote {
  return value === "bid" || value === "ask" || value === "hold";
}

function myVoteKey(roundId: number) {
  return `dreamdesk-my-vote:${roundId}`;
}

export function persistMyVote(roundId: number, vote: Vote) {
  try {
    sessionStorage.setItem(myVoteKey(roundId), vote);
  } catch {
    // private mode
  }
}

export function restoreMyVote(roundId: number): Vote | null {
  try {
    const raw = sessionStorage.getItem(myVoteKey(roundId));
    return raw && isVote(raw) ? raw : null;
  } catch {
    return null;
  }
}
