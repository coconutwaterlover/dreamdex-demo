"use client";

import { useCallback, useState } from "react";
import { useAccount, useConnect, useSwitchChain, useWriteContract } from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { deskArenaAbi } from "@/lib/chain/arena-abi";
import { operatorRegistryAbi } from "@/lib/chain/abi";
import { somniaShannon, wagmiConfig } from "@/lib/chain/config";
import {
  ARENA_ADDRESS,
  OPERATOR_REGISTRY,
  OPERATOR_SELECTORS,
  SESSION_ADDRESS,
  SOMI_USDSO_POOL,
} from "@/lib/chain/constants";
import { erc20Abi } from "@/lib/chain/pool-abi";
import { CHOICE_CODE, type Choice } from "@/lib/arena/types";
import { maxUint256 } from "viem";

/** Trims viem's multi-paragraph revert dumps down to the line a human needs. */
export function readableError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/User rejected|denied transaction|User denied/i.test(raw)) return "Signature rejected";
  if (/AlreadyVoted/.test(raw)) return "You already voted on this desk this round";
  if (/BadBond/.test(raw)) return "Send exactly the bond amount";
  if (/BadName/.test(raw)) return "Desk name must be 3–24 characters";
  if (/ArenaFull/.test(raw)) return "The arena is full this season";
  if (/Retired/.test(raw)) return "That desk has been retired";
  if (/insufficient funds/i.test(raw)) return "Not enough STT for gas and bond";
  return raw.split("\n")[0].slice(0, 200);
}

export function useArenaActions() {
  const { address, isConnected, chainId } = useAccount();
  const { connectAsync, connectors, isPending: connecting } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ensureWallet = useCallback(async () => {
    let account = address;
    if (!isConnected || !account) {
      const connector = connectors[0];
      if (!connector) throw new Error("No browser wallet found — install MetaMask or a Somnia-ready wallet");
      const result = await connectAsync({ connector });
      account = result.accounts[0];
    }
    if (chainId !== somniaShannon.id) {
      await switchChainAsync({ chainId: somniaShannon.id });
    }
    return account;
  }, [address, isConnected, chainId, connectAsync, connectors, switchChainAsync]);

  const run = useCallback(
    async (label: string, fn: () => Promise<`0x${string}`>) => {
      setBusy(label);
      setError(null);
      try {
        await ensureWallet();
        const hash = await fn();
        await waitForTransactionReceipt(wagmiConfig, { hash });
        return hash;
      } catch (err) {
        const message = readableError(err);
        setError(message);
        throw new Error(message);
      } finally {
        setBusy(null);
      }
    },
    [ensureWallet],
  );

  const vote = useCallback(
    (deskId: number, choice: Exclude<Choice, "none">) =>
      run(`vote:${deskId}`, () =>
        writeContractAsync({
          address: ARENA_ADDRESS!,
          abi: deskArenaAbi,
          functionName: "vote",
          args: [BigInt(deskId), CHOICE_CODE[choice]],
        }),
      ),
    [run, writeContractAsync],
  );

  const createDesk = useCallback(
    (name: string, bondWei: bigint) =>
      run("create", () =>
        writeContractAsync({
          address: ARENA_ADDRESS!,
          abi: deskArenaAbi,
          functionName: "createDesk",
          args: [name],
          value: bondWei,
        }),
      ),
    [run, writeContractAsync],
  );

  const setWantsLive = useCallback(
    (deskId: number, wantsLive: boolean) =>
      run(`live:${deskId}`, () =>
        writeContractAsync({
          address: ARENA_ADDRESS!,
          abi: deskArenaAbi,
          functionName: "setWantsLive",
          args: [BigInt(deskId), wantsLive],
        }),
      ),
    [run, writeContractAsync],
  );

  const retireDesk = useCallback(
    (deskId: number) =>
      run(`retire:${deskId}`, () =>
        writeContractAsync({
          address: ARENA_ADDRESS!,
          abi: deskArenaAbi,
          functionName: "retireDesk",
          args: [BigInt(deskId)],
        }),
      ),
    [run, writeContractAsync],
  );

  const settle = useCallback(
    (wallet: string) =>
      run("settle", () =>
        writeContractAsync({
          address: ARENA_ADDRESS!,
          abi: deskArenaAbi,
          functionName: "settle",
          args: [wallet as `0x${string}`, BigInt(64)],
        }),
      ),
    [run, writeContractAsync],
  );

  /** Grants the arena's session key permission to place orders that you still own. */
  const grantSessionKey = useCallback(
    (grant: boolean) =>
      run("grant", () =>
        writeContractAsync({
          address: OPERATOR_REGISTRY,
          abi: operatorRegistryAbi,
          functionName: "setOperatorApprovalGlobal",
          args: [SESSION_ADDRESS!, [...OPERATOR_SELECTORS], grant],
        }),
      ),
    [run, writeContractAsync],
  );

  const approveUsdso = useCallback(
    (token: `0x${string}`) =>
      run("approve", () =>
        writeContractAsync({
          address: token,
          abi: erc20Abi,
          functionName: "approve",
          args: [SOMI_USDSO_POOL, maxUint256],
        }),
      ),
    [run, writeContractAsync],
  );

  return {
    address,
    isConnected,
    connecting,
    onWrongChain: isConnected && chainId !== somniaShannon.id,
    busy,
    error,
    clearError: () => setError(null),
    ensureWallet,
    vote,
    createDesk,
    setWantsLive,
    retireDesk,
    settle,
    grantSessionKey,
    approveUsdso,
  };
}
