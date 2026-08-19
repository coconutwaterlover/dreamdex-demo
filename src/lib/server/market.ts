import { formatUnits, parseUnits } from "viem";
import { DREAMDEX_API_URL, SOMI_USDSO_POOL } from "@/lib/chain/constants";
import { poolAbi } from "@/lib/chain/pool-abi";
import { getPublicClient } from "./session";

/** Last-resort mark when neither the HTTP quote nor the on-chain book answers. */
const INITIAL_MID = 0.0875;

export type MarketQuote = {
  last: number;
  bid: number;
  ask: number;
};

function num(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value !== "" && Number.isFinite(Number(value))) return Number(value);
  return undefined;
}

function fromBook(bids: { price: unknown; quantity?: unknown }[], asks: { price: unknown; quantity?: unknown }[]): MarketQuote | null {
  const bid = num(bids[0]?.price);
  const ask = num(asks[0]?.price);
  if (bid === undefined && ask === undefined) return null;
  const last = bid !== undefined && ask !== undefined ? (bid + ask) / 2 : (bid ?? ask)!;
  return { last, bid: bid ?? last, ask: ask ?? last };
}

async function fetchHttpQuote(): Promise<MarketQuote | null> {
  try {
    const bookRes = await fetch(`${DREAMDEX_API_URL}/orderbooks?symbols=SOMI:USDso&depth=1`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1200),
    });
    if (bookRes.ok) {
      const data = (await bookRes.json()) as {
        orderbooks?: { bids?: { price: string }[]; asks?: { price: string }[] }[];
      };
      const book = data.orderbooks?.[0];
      const parsed = book ? fromBook(book.bids ?? [], book.asks ?? []) : null;
      if (parsed) return parsed;
    }
  } catch {
    // fall through
  }
  try {
    const tickerRes = await fetch(`${DREAMDEX_API_URL}/tickers?symbols=SOMI:USDso`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1200),
    });
    if (tickerRes.ok) {
      const data = (await tickerRes.json()) as { symbols?: { close?: string }[] };
      const close = num(data.symbols?.[0]?.close);
      if (close) return { last: close, bid: close, ask: close };
    }
  } catch {
    // fall through
  }
  return null;
}

export async function fetchOnChainBook(depth = 1): Promise<{ bids: { price: bigint; quantity: bigint }[]; asks: { price: bigint; quantity: bigint }[] }> {
  const client = getPublicClient();
  const [bids, asks] = await Promise.all([
    client.readContract({
      address: SOMI_USDSO_POOL,
      abi: poolAbi,
      functionName: "getBookLevels",
      args: [true, BigInt(depth)],
    }),
    client.readContract({
      address: SOMI_USDSO_POOL,
      abi: poolAbi,
      functionName: "getBookLevels",
      args: [false, BigInt(depth)],
    }),
  ]);
  return { bids: [...bids], asks: [...asks] };
}

const QUOTE_TTL_MS = 2500;
let quoteCache: { at: number; quote: MarketQuote } | null = null;

export async function fetchMarketQuote(): Promise<MarketQuote> {
  if (quoteCache && Date.now() - quoteCache.at < QUOTE_TTL_MS) return quoteCache.quote;
  const http = await fetchHttpQuote();
  if (http) {
    quoteCache = { at: Date.now(), quote: http };
    return http;
  }
  if (quoteCache) return quoteCache.quote;
  try {
    const { bids, asks } = await fetchOnChainBook(1);
    const parsed = fromBook(
      bids.map((l) => ({ price: formatUnits(l.price, 18) })),
      asks.map((l) => ({ price: formatUnits(l.price, 18) })),
    );
    if (parsed) {
      quoteCache = { at: Date.now(), quote: parsed };
      return parsed;
    }
  } catch {
    // fall through
  }
  const fallback = { last: INITIAL_MID, bid: INITIAL_MID - 0.0001, ask: INITIAL_MID + 0.0001 };
  quoteCache = { at: Date.now(), quote: fallback };
  return fallback;
}

export function quoteToRawPrice(human: number, decimals = 18): bigint {
  const text = human.toFixed(8).replace(/\.?0+$/, "") || "0";
  return parseUnits(text, decimals);
}
