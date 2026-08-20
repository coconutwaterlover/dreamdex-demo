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

/** What the real leg did for one (round, desk), beside what the paper book recorded. */
export type MirrorRow = {
  roundId: number;
  deskId: number;
  side: string;
  txHash: string | null;
  error: string | null;
  intendedPrice: number | null;
  placedPrice: number | null;
  slipBps: number | null;
  repriced: boolean;
  at: number;
};

/**
 * The size gap between the two legs, read live from the arena and the pool rather than
 * hardcoded — it is the single clearest statement of how much of a desk is real.
 */
export type Scale = {
  paperLotSomi: number;
  realLotSomi: number;
  /** paperLot / realLot — how many times larger the modelled trade is. */
  ratio: number;
};

/** An armed desk's actual wallet, for comparison against its modelled book. */
export type RealBook = {
  deskId: number;
  owner: string;
  usdso: number;
  somi: number;
};

/** A desk's parimutuel pool for one round. Amounts are STT. */
export type PoolRow = {
  roundId: number;
  deskId: number;
  bid: number;
  ask: number;
  rollover: number;
  pot: number;
  payout: number;
  winningStake: number;
  winner: number;
  settled: boolean;
  refunded: boolean;
  open: boolean;
  lockAt: number;
  /** What 1 STT on this side returns if it wins, net of rake. 0 when the side is empty. */
  bidOdds: number;
  askOdds: number;
};

export type MyStake = {
  roundId: number;
  deskId: number;
  bid: number;
  ask: number;
  claimed: boolean;
  claimable: number;
};

export type StakerRow = {
  wallet: string;
  netWinnings: number;
  stakedTotal: number;
  positionsStaked: number;
  rank: number;
};

export type StakeConfig = {
  address: string;
  lockSeconds: number;
  minStake: number;
  ownerRakeBps: number;
  treasuryRakeBps: number;
  secondsToLock: number;
};

export type ArenaSnapshot = {
  configured: boolean;
  state: ArenaState;
  desks: DeskRow[];
  contributors: ContributorRow[];
  clock: ClockState | null;
  scale: Scale | null;
  realBooks: RealBook[];
  stake: StakeConfig | null;
  pools: PoolRow[];
  stakers: StakerRow[];
  mirror: { entries: MirrorRow[]; since: number };
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
