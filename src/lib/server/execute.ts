import { BaseError, ContractFunctionRevertedError, decodeErrorResult, formatUnits, zeroAddress } from "viem";
import {
  HOUSE_OWNER_ADDRESS,
  PLACE_ORDER_FOR,
  SESSION_ADDRESS,
  SOMI_USDSO_POOL,
} from "@/lib/chain/constants";
import {
  erc20Abi,
  NATIVE_BUY_GAS,
  NATIVE_TOKEN,
  ORDER_TYPE_POST_ONLY,
  poolAbi,
} from "@/lib/chain/pool-abi";
import type { Vote } from "@/lib/desk/types";
import { fetchOnChainBook, quoteToRawPrice } from "./market";
import { getPublicClient, getSessionWallet, isExecutorConfigured, writeSessionContract } from "./session";

export type ExecuteResult =
  | { ok: true; skipped: true; reason: "hold" }
  | { ok: true; skipped: false; txHash: `0x${string}` }
  | { ok: false; blocked: true; error: string }
  | { ok: false; blocked: false; error: string };

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
        return "House owner USDso balance is too low for this bid — fund the owner wallet";
      }
      if (name === "ERC20InsufficientAllowance") {
        return "House owner must Approve USDso for the pool";
      }
      if (name) return name;
    }
  }
  const sel = selectorOf(err);
  if (sel === "0x7cf05fcb") return "PostOnlyWouldCross — bid was through the ask";
  if (sel === "0xe450d38c") return "House owner USDso balance is too low for this bid — fund the owner wallet";
  if (sel === "0xfb8f41b2") return "House owner must Approve USDso for the pool";
  if (sel === "0x3fb0ba2e") return "OnlyApprovedContracts";
  if (sel) {
    try {
      const decoded = decodeErrorResult({ abi: [...poolAbi, ...erc20Abi], data: sel });
      if (decoded.errorName === "PostOnlyWouldCross") return "PostOnlyWouldCross — bid was through the ask";
      if (decoded.errorName === "ERC20InsufficientBalance") {
        return "House owner USDso balance is too low for this bid — fund the owner wallet";
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

export async function executeResolvedVote(winner: Vote): Promise<ExecuteResult> {
  try {
    if (winner === "hold") return { ok: true, skipped: true, reason: "hold" };
    if (!isExecutorConfigured()) {
      return { ok: false, blocked: false, error: "SESSION_PRIVATE_KEY is not set" };
    }
    if (!HOUSE_OWNER_ADDRESS || !SESSION_ADDRESS) {
      return { ok: false, blocked: false, error: "House owner / session address missing" };
    }

    const publicClient = getPublicClient();
    const wallet = getSessionWallet();
    const isBid = winner === "bid";

    const authorized = await publicClient.readContract({
      address: SOMI_USDSO_POOL,
      abi: poolAbi,
      functionName: "isOperatorAuthorized",
      args: [HOUSE_OWNER_ADDRESS, wallet.account.address, PLACE_ORDER_FOR],
    });
    if (!authorized) {
      return { ok: false, blocked: true, error: "OnlyApprovedContracts" };
    }

    const params = await publicClient.readContract({
      address: SOMI_USDSO_POOL,
      abi: poolAbi,
      functionName: "getPoolParams",
    });
    const [, , , , tickSize, minQuantity, lotSize] = params;

    const book = await fetchOnChainBook(1);
    const fallback = quoteToRawPrice(isBid ? 0.0875 : 0.0876);
    const rawPrice = postOnlyPrice(isBid, tickSize, book, fallback);
    const { price, quantity } = quantize(rawPrice, minQuantity, tickSize, lotSize, minQuantity, isBid);

    const pull = await publicClient.readContract({
      address: SOMI_USDSO_POOL,
      abi: poolAbi,
      functionName: "getAutoPullRequirement",
      args: [HOUSE_OWNER_ADDRESS, isBid, price, quantity, BigInt(0)],
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
          args: [HOUSE_OWNER_ADDRESS],
        }),
        publicClient.readContract({
          address: inputToken,
          abi: erc20Abi,
          functionName: "allowance",
          args: [HOUSE_OWNER_ADDRESS, SOMI_USDSO_POOL],
        }),
      ]);
      if (allowance < requiredAmount) {
        return { ok: false, blocked: false, error: "House owner must Approve USDso for the pool" };
      }
      if (balance < requiredAmount) {
        return {
          ok: false,
          blocked: false,
          error: `House owner USDso balance ${formatUnits(balance, 18)} < ${formatUnits(requiredAmount, 18)} needed for this bid`,
        };
      }
    } else if (value > BigInt(0)) {
      const sessionBal = await publicClient.getBalance({ address: wallet.account.address });
      if (sessionBal < value) {
        return {
          ok: false,
          blocked: false,
          error: `Session key native balance too low to attach msg.value for this ask`,
        };
      }
    }

    const args = [
      HOUSE_OWNER_ADDRESS,
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
      return { ok: false, blocked: false, error: "placeOrderFor returned success=false (PostOnly crossed or silent reject)" };
    }
    const txHash = await writeSessionContract({
      address: SOMI_USDSO_POOL,
      abi: poolAbi,
      functionName: "placeOrderFor",
      args,
      value,
      gas,
    });
    return { ok: true, skipped: false, txHash };
  } catch (err) {
    if (isBlockedError(err)) {
      return { ok: false, blocked: true, error: "OnlyApprovedContracts" };
    }
    return { ok: false, blocked: false, error: decodeExecuteError(err) };
  }
}
