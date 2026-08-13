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
  tokenId?: number;
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

export type RoundBallot = { address: string; vote: Vote; name?: string };

export type ScoreDelta = {
  address: string;
  name: string;
  delta: number;
  pts: number;
  tokenId: number | null;
};

export type MintNotice = {
  roundId: number;
  name: string;
  score: number;
  tokenId: number | null;
  txHash: string | null;
};

export type RoundSnapshot = {
  id: number | null;
  status: "idle" | "voting" | "resolving" | "scored" | "blocked";
  endsAt: number | null;
  remaining: number;
  tally: VoteTally;
  ballots: RoundBallot[];
  winner: Vote | null;
  txHash: string | null;
  error: string | null;
  mid: number;
  subscriptionId: string | null;
  scheduleTxHash: string | null;
  badgeTxHash: string | null;
  badgeError: string | null;
  minted: string[];
  scoreDeltas: ScoreDelta[];
};
