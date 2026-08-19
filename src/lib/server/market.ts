import { parseUnits } from "viem";
import { SOMI_USDSO_POOL } from "@/lib/chain/constants";
import { poolAbi } from "@/lib/chain/pool-abi";
import { getPublicClient } from "./session";

/**
 * Reads the SOMI:USDso book straight off the SpotPool.
 *
 * There is no HTTP path here on purpose: the arena prices its own rounds from
 * `getBookLevels` inside the settling transaction, so the only reason the server ever
 * needs the book is to reprice a PostOnly order before placing it. Same source, same
 * block — a REST quote could only disagree.
 */
export async function fetchOnChainBook(depth = 1): Promise<{
  bids: { price: bigint; quantity: bigint }[];
  asks: { price: bigint; quantity: bigint }[];
}> {
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

export function quoteToRawPrice(human: number, decimals = 18): bigint {
  const text = human.toFixed(8).replace(/\.?0+$/, "") || "0";
  return parseUnits(text, decimals);
}
