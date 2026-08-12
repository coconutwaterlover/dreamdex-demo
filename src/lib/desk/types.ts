export type Phase =
  | "boot"
  | "connected"
  | "armed"
  | "voting"
  | "resolving"
  | "signing"
  | "scored"
  | "revoked"
  | "blocked";

export type Vote = "bid" | "ask" | "hold";

export type VoteTally = { bid: number; ask: number; hold: number };

export type Voter = {
  id: string;
  name: string;
  pts: number;
  vote?: Vote;
  delta?: number;
};

export type TapeItem = {
  id: string;
  t: string;
  label: string;
  tone: "neutral" | "live" | "ok" | "warn";
};

export type DeskView = {
  owner: boolean;
  session: boolean;
  approved: boolean;
  revoked: boolean;
  live: boolean;
};
