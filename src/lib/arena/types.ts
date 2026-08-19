export type Choice = "none" | "bid" | "ask" | "hold";

export const CHOICE_CODE: Record<Exclude<Choice, "none">, number> = { bid: 1, ask: 2, hold: 3 };
export const CODE_CHOICE: Record<number, Choice> = { 0: "none", 1: "bid", 2: "ask", 3: "hold" };

export type ArenaState = {
  roundId: number;
  endsAt: number;
  lastTickedRound: number;
  mid: number;
  season: number;
  seasonRound: number;
  deskCount: number;
  voterCount: number;
  createBondWei: string;
  sessionKey: string;
  behind: boolean;
};

export type DeskRow = {
  deskId: number;
  owner: string;
  name: string;
  cash: number;
  base: number;
  pnl: number;
  seasonPnl: number;
  equity: number;
  createdRound: number;
  roundsTraded: number;
  wins: number;
  armed: boolean;
  wantsLive: boolean;
  retired: boolean;
  tally: { bid: number; ask: number; hold: number };
  votes: number;
  rank: number;
};

export type ContributorRow = {
  wallet: string;
  handle: string;
  tokenId: number | null;
  points: number;
  seasonPoints: number;
  ballotsCast: number;
  roundsScored: number;
  streak: number;
  bestStreak: number;
  lastVotedRound: number;
  pending: number;
  rank: number;
};

export type ClockState = {
  address: string | null;
  fireCount: number;
  lastFiredAtMs: number;
  armedForMs: number;
  subscriptionId: string;
  balance: string;
  funded: boolean;
};

export type ArenaSnapshot = {
  configured: boolean;
  state: ArenaState;
  desks: DeskRow[];
  contributors: ContributorRow[];
  clock: ClockState | null;
  addresses: {
    arena: string | null;
    deskBadge: string | null;
    contributorBadge: string | null;
    pool: string;
    registry: string;
  };
};

/** What a vote means in trader terms, and in stall terms. */
export const CHOICE_META: Record<Exclude<Choice, "none">, { verb: string; trader: string; blurb: string }> = {
  bid: { verb: "Buy", trader: "Bid", blurb: "The desk goes long a lot of SOMI at the closing mid" },
  ask: { verb: "Sell", trader: "Ask", blurb: "The desk goes short a lot of SOMI at the closing mid" },
  hold: { verb: "Wait", trader: "Hold", blurb: "The desk sits this round out and keeps its book flat" },
};

export const CHOICE_ORDER: Exclude<Choice, "none">[] = ["bid", "ask", "hold"];
