import { SDK, SomniaReactivityPrecompileABI } from "@somnia-chain/reactivity";
import { parseEventLogs, zeroAddress, type Hex } from "viem";
import { ROUND_CLOCK_ADDRESS, isRoundClockConfigured } from "@/lib/chain/constants";
import { roundClockAbi } from "@/lib/chain/round-clock-abi";
import { getPublicClient, getSessionWallet } from "./session";

const SCHEDULE_OPTIONS = {
  priorityFeePerGas: 1n,
  maxFeePerGas: 0n,
  gasLimit: 2_000_000n,
} as const;

export type ScheduledRound = {
  subscriptionId: bigint;
  txHash: Hex;
  fireCount: bigint;
};

function getSdk() {
  return new SDK({
    public: getPublicClient(),
    wallet: getSessionWallet(),
  });
}

export async function readFireCount(): Promise<bigint> {
  if (!isRoundClockConfigured() || !ROUND_CLOCK_ADDRESS) return BigInt(0);
  return getPublicClient().readContract({
    address: ROUND_CLOCK_ADDRESS,
    abi: roundClockAbi,
    functionName: "fireCount",
  });
}

export async function scheduleRoundEnd(endsAtMs: number): Promise<ScheduledRound> {
  if (!isRoundClockConfigured() || !ROUND_CLOCK_ADDRESS) {
    throw new Error("Round clock not deployed — set NEXT_PUBLIC_ROUND_CLOCK_ADDRESS");
  }
  const fireCount = await readFireCount();
  const sdk = getSdk();
  const txHash = await sdk.scheduleSubscriptionAtTimestamp({
    timestampMs: endsAtMs,
    handlerContractAddress: ROUND_CLOCK_ADDRESS,
    options: SCHEDULE_OPTIONS,
  });
  if (txHash instanceof Error) {
    throw new Error(txHash.message);
  }
  const receipt = await getPublicClient().waitForTransactionReceipt({ hash: txHash });
  const created = parseEventLogs({
    abi: SomniaReactivityPrecompileABI,
    eventName: "SubscriptionCreated",
    logs: receipt.logs,
  });
  const subscriptionId = created[0]?.args.subscriptionId;
  if (subscriptionId === undefined) {
    throw new Error("Reactivity subscribe mined without SubscriptionCreated");
  }
  return { subscriptionId, txHash, fireCount };
}

export async function reactivityHasFired(opts: {
  subscriptionId: bigint | null;
  fireCountAtOpen: bigint;
  endsAt: number;
}): Promise<boolean> {
  if (!isRoundClockConfigured()) return false;
  try {
    const count = await readFireCount();
    if (count > opts.fireCountAtOpen) return true;
  } catch {
    // clock unreadable — fall through to subscription probe
  }
  if (opts.subscriptionId == null) return false;
  try {
    const info = await getSdk().getSubscriptionInfo(opts.subscriptionId);
    if (info instanceof Error) return Date.now() >= opts.endsAt;
    const owner = Array.isArray(info)
      ? (info[1] as string | undefined)
      : info.owner;
    return !owner || owner.toLowerCase() === zeroAddress;
  } catch {
    return Date.now() >= opts.endsAt;
  }
}

export function watchRoundFired(onFire: () => void): () => void {
  if (!isRoundClockConfigured() || !ROUND_CLOCK_ADDRESS) return () => undefined;
  return getPublicClient().watchContractEvent({
    address: ROUND_CLOCK_ADDRESS,
    abi: roundClockAbi,
    eventName: "RoundFired",
    onLogs: () => onFire(),
  });
}
