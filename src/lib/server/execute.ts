import { BaseError, ContractFunctionRevertedError, decodeErrorResult, formatUnits, zeroAddress } from "viem";
import type { Address } from "viem";
import { PLACE_ORDER_FOR, SESSION_ADDRESS, SOMI_USDSO_POOL } from "@/lib/chain/constants";
import {
  erc20Abi,
  NATIVE_BUY_GAS,
  NATIVE_TOKEN,
  ORDER_TYPE_POST_ONLY,
  poolAbi,
} from "@/lib/chain/pool-abi";
import { fetchOnChainBook, quoteToRawPrice } from "./market";
import { getPublicClient, getSessionWallet, isExecutorConfigured, writeSessionContract } from "./session";

/** What the order was meant to be, versus what actually went to the book. */
export type ExecuteReport = {
  /** The mid the arena settled the paper book at — the price this order is meant to hit. */
  intendedPriceE18: string | null;
  /** What PostOnly actually allowed us to post at. */
  placedPriceE18: string | null;
  quantityE18: string | null;
  /** Distance between intent and placement, signed, in bps of the intended price. */
  slipBps: number | null;
  /** True when PostOnly forced us off the intended price to avoid crossing. */
  repriced: boolean;
};

export type ExecuteResult = (
  | { ok: true; skipped: true; reason: string }
  | { ok: true; skipped: false; txHash: `0x${string}` }
  | { ok: false; blocked: true; error: string }
  | { ok: false; blocked: false; error: string }
) & { report: ExecuteReport };

const NO_REPORT: ExecuteReport = {
  intendedPriceE18: null,
  placedPriceE18: null,
  quantityE18: null,
  slipBps: null,
  repriced: false,
};

function slipOf(intended: bigint, placed: bigint): number {
  if (intended === BigInt(0)) return 0;
  return Number(((placed - intended) * BigInt(10_000)) / intended);
}

function quantize(price: bigint, quantity: bigint, tickSize: bigint, lotSize: bigint, minQuantity: bigint, isBid: boolean) {
  const qPrice = isBid
    ? (price / tickSize) * tickSize
    : ((price + tickSize - BigInt(1)) / tickSize) * tickSize;
  let qQuantity = (quantity / lotSize) * lotSize;
  if (qQuantity < minQuantity) qQuantity = minQuantity;
  if (qQuantity % lotSize !== BigInt(0)) qQuantity = (minQuantity / lotSize) * lotSize;
  if (qQuantity < minQuantity) qQuantity = minQuantity;
  if (qPrice === BigInt(0)) throw new Error("price rounds to zero — below one tick");
  return { price: qPrice, quantity: qQuantity };
}

/** PostOnly must rest: bid < best ask, ask > best bid. Join the near touch when the book exists. */
function postOnlyPrice(
  isBid: boolean,
  tickSize: bigint,
  book: { bids: { price: bigint }[]; asks: { price: bigint }[] },
  fallback: bigint,
): bigint {
  const bestBid = book.bids[0]?.price;
  const bestAsk = book.asks[0]?.price;
  if (isBid) {
    let price = bestBid ?? (bestAsk ? bestAsk - tickSize : fallback);
    if (bestAsk && price >= bestAsk) price = bestAsk - tickSize;
    return price > BigInt(0) ? price : tickSize;
  }
  let price = bestAsk ?? (bestBid ? bestBid + tickSize : fallback);
  if (bestBid && price <= bestBid) price = bestBid + tickSize;
  return price;
}

/**
 * Post at the arena's intended price when PostOnly allows it. If that price would take
 * liquidity the order is rejected outright, so step just inside the touch instead and
 * let the caller report the difference rather than hiding it.
 */
function postOnlyFromIntent(
  isBid: boolean,
  tickSize: bigint,
  book: { bids: { price: bigint }[]; asks: { price: bigint }[] },
  intended: bigint,
): bigint {
  const bestBid = book.bids[0]?.price;
  const bestAsk = book.asks[0]?.price;
  if (isBid) {
    if (bestAsk && intended >= bestAsk) return bestAsk - tickSize;
    return intended;
  }
  if (bestBid && intended <= bestBid) return bestBid + tickSize;
  return intended;
}

function selectorOf(err: unknown): `0x${string}` | null {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const sig = revert.signature;
      if (sig && /^0x[a-fA-F0-9]{8}$/.test(sig)) return sig as `0x${string}`;
      const data = revert.data;
      if (typeof data === "object" && data && "errorName" in data && data.errorName) {
        return null;
      }
      const raw = (revert as { raw?: unknown }).raw;
      if (typeof raw === "string" && raw.startsWith("0x") && raw.length >= 10) {
        return raw.slice(0, 10) as `0x${string}`;
      }
    }
  }
  const text = err instanceof Error ? err.message : String(err);
  const match = text.match(/0x[a-fA-F0-9]{8}/);
  return match ? (match[0] as `0x${string}`) : null;
}

function decodeExecuteError(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data && typeof revert.data === "object" && "errorName" in revert.data
        ? String(revert.data.errorName)
        : "";
      if (name === "PostOnlyWouldCross") return "PostOnlyWouldCross — price would take; repriced next round from the live book";
      if (name === "OnlyApprovedContracts") return "OnlyApprovedContracts";
      if (name === "ERC20InsufficientBalance") {
        return "Desk owner USDso balance is too low for this bid — fund the owner wallet";
      }
      if (name === "ERC20InsufficientAllowance") {
        return "Desk owner must Approve USDso for the pool";
      }
      if (name) return name;
    }
  }
  const sel = selectorOf(err);
  if (sel === "0x7cf05fcb") return "PostOnlyWouldCross — bid was through the ask";
  if (sel === "0xe450d38c") return "Desk owner USDso balance is too low for this bid — fund the owner wallet";
  if (sel === "0xfb8f41b2") return "Desk owner must Approve USDso for the pool";
  if (sel === "0x3fb0ba2e") return "OnlyApprovedContracts";
  if (sel) {
    try {
      const decoded = decodeErrorResult({ abi: [...poolAbi, ...erc20Abi], data: sel });
      if (decoded.errorName === "PostOnlyWouldCross") return "PostOnlyWouldCross — bid was through the ask";
      if (decoded.errorName === "ERC20InsufficientBalance") {
        return "Desk owner USDso balance is too low for this bid — fund the owner wallet";
      }
      return decoded.errorName;
    } catch {
      return `placeOrderFor reverted (${sel})`;
    }
  }
  return err instanceof Error ? err.message.split("\n")[0] : "placeOrderFor failed";
}

function isBlockedError(err: unknown): boolean {
  const text = decodeExecuteError(err);
  return /OnlyApprovedContracts/i.test(text);
}

/**
 * Mirrors one armed desk's winning move onto the real DreamDEX book. The order is
 * owned by, and settles to, the desk owner — the session key only gets to place it.
 *
 * `intendedPriceE18` is the mid the arena settled the paper book at. Pricing from it
 * rather than from the touch a few seconds later means the real order and the
 * leaderboard entry describe the same intent, and any gap between them is reported as
 * slip instead of quietly disappearing.
 */
export async function executeDeskMove(
  owner: Address,
  side: "bid" | "ask",
  intendedPriceE18?: bigint,
): Promise<ExecuteResult> {
  try {
    if (!isExecutorConfigured()) {
      return { ok: false, blocked: false, error: "SESSION_PRIVATE_KEY is not set", report: NO_REPORT };
    }
    if (!SESSION_ADDRESS) {
      return { ok: false, blocked: false, error: "Session address missing", report: NO_REPORT };
    }

    const publicClient = getPublicClient();
    const wallet = getSessionWallet();
    const isBid = side === "bid";

    const authorized = await publicClient.readContract({
      address: SOMI_USDSO_POOL,
      abi: poolAbi,
      functionName: "isOperatorAuthorized",
      args: [owner, wallet.account.address, PLACE_ORDER_FOR],
    });
    if (!authorized) {
      return { ok: false, blocked: true, error: "OnlyApprovedContracts", report: NO_REPORT };
    }

    const params = await publicClient.readContract({
      address: SOMI_USDSO_POOL,
      abi: poolAbi,
      functionName: "getPoolParams",
    });
    const [, , , , tickSize, minQuantity, lotSize] = params;

    const book = await fetchOnChainBook(1);
    // Prefer the arena's settled mid; fall back to the touch only if we weren't given one.
    const fallback = intendedPriceE18 ?? quoteToRawPrice(isBid ? 0.0875 : 0.0876);
    const rawPrice = intendedPriceE18
      ? postOnlyFromIntent(isBid, tickSize, book, intendedPriceE18)
      : postOnlyPrice(isBid, tickSize, book, fallback);
    const { price, quantity } = quantize(rawPrice, minQuantity, tickSize, lotSize, minQuantity, isBid);

    const intended = intendedPriceE18 ?? price;
    const report: ExecuteReport = {
      intendedPriceE18: intended.toString(),
      placedPriceE18: price.toString(),
      quantityE18: quantity.toString(),
      slipBps: slipOf(intended, price),
      repriced: price !== intended,
    };

    const pull = await publicClient.readContract({
      address: SOMI_USDSO_POOL,
      abi: poolAbi,
      functionName: "getAutoPullRequirement",
      args: [owner, isBid, price, quantity, BigInt(0)],
    });
    const [inputToken, requiredAmount] = pull;
    const nativeInput =
      inputToken.toLowerCase() === NATIVE_TOKEN.toLowerCase() || inputToken === zeroAddress;
    const value = !isBid && nativeInput ? requiredAmount : BigInt(0);
    const gas = isBid ? NATIVE_BUY_GAS : undefined;
    const expireTimestampNs = (BigInt(Date.now()) + BigInt(86_400_000)) * BigInt(1_000_000);

    if (!nativeInput) {
      const [balance, allowance] = await Promise.all([
        publicClient.readContract({
          address: inputToken,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [owner],
        }),
        publicClient.readContract({
          address: inputToken,
          abi: erc20Abi,
          functionName: "allowance",
          args: [owner, SOMI_USDSO_POOL],
        }),
      ]);
      if (allowance < requiredAmount) {
        return { ok: false, blocked: false, error: "Desk owner must Approve USDso for the pool", report };
      }
      if (balance < requiredAmount) {
        return {
          ok: false,
          blocked: false,
          error: `Desk owner USDso balance ${formatUnits(balance, 18)} < ${formatUnits(requiredAmount, 18)} needed for this bid`,
          report,
        };
      }
    } else if (value > BigInt(0)) {
      const sessionBal = await publicClient.getBalance({ address: wallet.account.address });
      if (sessionBal < value) {
        return {
          ok: false,
          blocked: false,
          error: `Session key native balance too low to attach msg.value for this ask`,
          report,
        };
      }
    }

    const args = [
      owner,
      isBid,
      BigInt(0),
      price,
      quantity,
      expireTimestampNs,
      ORDER_TYPE_POST_ONLY,
      0,
      zeroAddress,
      BigInt(0),
    ] as const;

    const sim = await publicClient.simulateContract({
      account: wallet.account,
      address: SOMI_USDSO_POOL,
      abi: poolAbi,
      functionName: "placeOrderFor",
      args,
      value,
      gas,
    });
    if (!sim.result[0]) {
      return { ok: false, blocked: false, error: "placeOrderFor returned success=false (PostOnly crossed or silent reject)", report };
    }
    const txHash = await writeSessionContract({
      address: SOMI_USDSO_POOL,
      abi: poolAbi,
      functionName: "placeOrderFor",
      args,
      value,
      gas,
    });
    return { ok: true, skipped: false, txHash, report };
  } catch (err) {
    if (isBlockedError(err)) {
      return { ok: false, blocked: true, error: "OnlyApprovedContracts", report: NO_REPORT };
    }
    return { ok: false, blocked: false, error: decodeExecuteError(err), report: NO_REPORT };
  }
}
