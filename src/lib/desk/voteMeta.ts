import type { Vote } from "./types";

/** Demo / pre-chain fallback. Live size comes from pool `minQuantity`. */
export const FALLBACK_LOT_SOMI = 1;

export type VoteMeta = {
  vote: Vote;
  verb: "Buy" | "Sell" | "Wait";
  title: string;
  trader: string;
  rest: string;
};

export const VOTE_META: Record<Vote, VoteMeta> = {
  bid: {
    vote: "bid",
    verb: "Buy",
    title: "Buy SOMI",
    trader: "Bid",
    rest: "Stall buys here",
  },
  ask: {
    vote: "ask",
    verb: "Sell",
    title: "Sell SOMI",
    trader: "Ask",
    rest: "Stall sells here",
  },
  hold: {
    vote: "hold",
    verb: "Wait",
    title: "Keep the stall quiet",
    trader: "Hold",
    rest: "No order this round",
  },
};

export const VOTE_ORDER: Vote[] = ["bid", "ask", "hold"];

export function stallSize(qty: number | undefined | null): number {
  return Number.isFinite(qty) && (qty as number) > 0 ? (qty as number) : FALLBACK_LOT_SOMI;
}

export function formatLot(qty: number | undefined | null): string {
  return stallSize(qty).toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function formatPx(px: number): string {
  return px.toFixed(4);
}

export function formatUsdso(qty: number, px: number): string {
  return (stallSize(qty) * px).toLocaleString("en-US", {
    maximumFractionDigits: 4,
    minimumFractionDigits: 2,
  });
}

export function sizeLine(vote: Vote, qty: number, bid: number, ask: number): string {
  const n = stallSize(qty);
  const lot = formatLot(n);
  if (vote === "bid") return `${lot} SOMI · pays ~${formatUsdso(n, bid)} USDso`;
  if (vote === "ask") return `${lot} SOMI · for ~${formatUsdso(n, ask)} USDso`;
  return "No size — stall stays closed";
}

export function cardHint(vote: Vote, qty: number, bid: number, ask: number): string {
  const lot = formatLot(qty);
  if (vote === "bid") return `If this wins, the stall rests a buy of ${lot} SOMI @ ${formatPx(bid)}`;
  if (vote === "ask") return `If this wins, the stall rests a sell of ${lot} SOMI @ ${formatPx(ask)}`;
  return "If this wins, no order this round";
}

export function previewLine(vote: Vote, qty: number, bid: number, ask: number): string {
  const lot = formatLot(qty);
  if (vote === "bid") return `If Buy wins → session key posts a buy of ${lot} SOMI @ ${formatPx(bid)}`;
  if (vote === "ask") return `If Sell wins → session key posts a sell of ${lot} SOMI @ ${formatPx(ask)}`;
  return "If Wait wins → nothing is sent";
}

export function committedLine(vote: Vote, qty: number, bid: number, ask: number): string {
  const lot = formatLot(qty);
  if (vote === "bid") return `You voted Buy — if this wins, the stall rests a buy of ${lot} SOMI @ ${formatPx(bid)}`;
  if (vote === "ask") return `You voted Sell — if this wins, the stall rests a sell of ${lot} SOMI @ ${formatPx(ask)}`;
  return "You voted Wait — if this wins, no order is sent";
}

export function outcomeHeadline(vote: Vote, qty: number, bid: number, ask: number): string {
  const lot = formatLot(qty);
  if (vote === "bid") return `Crowd chose Buy. Stall posted a buy of ${lot} SOMI @ ${formatPx(bid)}.`;
  if (vote === "ask") return `Crowd chose Sell. Stall posted a sell of ${lot} SOMI @ ${formatPx(ask)}.`;
  return "Crowd chose Wait. Stall stayed quiet — no order.";
}

export function executeVerb(vote: Vote, qty: number, bid: number, ask: number): string {
  const lot = formatLot(qty);
  if (vote === "bid") return `Buy of ${lot} SOMI @ ${formatPx(bid)} posted`;
  if (vote === "ask") return `Sell of ${lot} SOMI @ ${formatPx(ask)} posted`;
  return "Wait — no order sent";
}
