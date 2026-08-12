import type { Vote } from "./types";

export function voteMessage(roundId: number, choice: Vote): string {
  return `DreamDesk swarm vote\nRound: ${roundId}\nChoice: ${choice}`;
}

export function isVote(value: string): value is Vote {
  return value === "bid" || value === "ask" || value === "hold";
}
