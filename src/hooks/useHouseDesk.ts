"use client";

import { useCallback, useMemo } from "react";
import { formatUnits, maxUint256 } from "viem";
import {
  useAccount,
  useConnect,
  useReadContract,
  useReadContracts,
  useSignMessage,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import { waitForTransactionReceipt } from "wagmi/actions";
import { operatorRegistryAbi } from "@/lib/chain/abi";
import { somniaShannon, wagmiConfig } from "@/lib/chain/config";
import {
  CANCEL_ORDER_FOR,
  FALLBACK_OWNER_LABEL,
  FALLBACK_SESSION_LABEL,
  HOUSE_OWNER_ADDRESS,
  isChainConfigured,
  OPERATOR_REGISTRY,
  OPERATOR_SELECTORS,
  PLACE_ORDER_FOR,
  REDUCE_ORDER_FOR,
  SESSION_ADDRESS,
  SOMI_USDSO_POOL,
} from "@/lib/chain/constants";
import { erc20Abi, poolAbi } from "@/lib/chain/pool-abi";
import { shortAddress } from "@/lib/desk/round";
import { FALLBACK_LOT_SOMI, stallSize } from "@/lib/desk/voteMeta";

export function useHouseDesk() {
  const chainEnabled = isChainConfigured();
  const houseOwner = HOUSE_OWNER_ADDRESS;
  const session = SESSION_ADDRESS;

  const { address, isConnected, chainId } = useAccount();
  const { connectAsync, connectors, isPending: connecting } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending: writing } = useWriteContract();
  const { signMessageAsync } = useSignMessage();

  const isHouseOwner =
    !!address && !!houseOwner && address.toLowerCase() === houseOwner.toLowerCase();

  const approvalReads = useReadContracts({
    contracts:
      chainEnabled && houseOwner && session
        ? [
            {
              address: OPERATOR_REGISTRY,
              abi: operatorRegistryAbi,
              functionName: "isGloballyApproved",
              args: [houseOwner, session, PLACE_ORDER_FOR],
            },
            {
              address: OPERATOR_REGISTRY,
              abi: operatorRegistryAbi,
              functionName: "isGloballyApproved",
              args: [houseOwner, session, CANCEL_ORDER_FOR],
            },
            {
              address: OPERATOR_REGISTRY,
              abi: operatorRegistryAbi,
              functionName: "isGloballyApproved",
              args: [houseOwner, session, REDUCE_ORDER_FOR],
            },
          ]
        : [],
    query: {
      enabled: chainEnabled,
      refetchInterval: 4000,
    },
  });

  const poolParams = useReadContract({
    address: SOMI_USDSO_POOL,
    abi: poolAbi,
    functionName: "getPoolParams",
    query: { enabled: chainEnabled },
  });

  const quoteToken = poolParams.data?.[1];
  const stallLot = stallSize(
    poolParams.data?.[5] != null ? Number(formatUnits(poolParams.data[5], 18)) : FALLBACK_LOT_SOMI,
  );

  const approved = useMemo(() => {
    if (!chainEnabled) return undefined;
    const results = approvalReads.data;
    if (!results || results.length < 3) return undefined;
    if (results.some((r) => r.status !== "success")) return undefined;
    return results.every((r) => r.result === true);
  }, [approvalReads.data, chainEnabled]);

  const ownerLabel = houseOwner ? shortAddress(houseOwner) : FALLBACK_OWNER_LABEL;
  const sessionLabel = session ? shortAddress(session) : FALLBACK_SESSION_LABEL;

  const connectWallet = useCallback(async () => {
    const connector = connectors.find((c) => c.id === "injected") ?? connectors[0];
    if (!connector) throw new Error("No wallet found");
    let nextAddress = address;
    let nextChainId = chainId;
    if (!isConnected) {
      const result = await connectAsync({ connector, chainId: somniaShannon.id });
      nextAddress = result.accounts[0];
      nextChainId = result.chainId;
    }
    if (nextChainId !== somniaShannon.id) {
      await switchChainAsync({ chainId: somniaShannon.id });
    }
    const owner =
      !!nextAddress && !!houseOwner && nextAddress.toLowerCase() === houseOwner.toLowerCase();
    return { address: nextAddress, isHouseOwner: owner };
  }, [address, chainId, connectAsync, connectors, houseOwner, isConnected, switchChainAsync]);

  const setApproval = useCallback(
    async (next: boolean) => {
      if (!session) throw new Error("SESSION_ADDRESS is not set");
      if (!isHouseOwner) throw new Error("Connect the house owner wallet");
      const hash = await writeContractAsync({
        address: OPERATOR_REGISTRY,
        abi: operatorRegistryAbi,
        functionName: "setOperatorApprovalGlobal",
        args: [session, [...OPERATOR_SELECTORS], next],
        chainId: somniaShannon.id,
      });
      await waitForTransactionReceipt(wagmiConfig, { hash });
      await approvalReads.refetch();
      return hash;
    },
    [approvalReads, isHouseOwner, session, writeContractAsync],
  );

  const grantSession = useCallback(() => setApproval(true), [setApproval]);
  const revokeDesk = useCallback(() => setApproval(false), [setApproval]);

  const signVote = useCallback(
    async (message: string) => {
      return signMessageAsync({ message });
    },
    [signMessageAsync],
  );

  const approveUsdso = useCallback(async () => {
    if (!isHouseOwner) throw new Error("Connect the house owner wallet");
    if (!quoteToken) throw new Error("Quote token not loaded");
    const hash = await writeContractAsync({
      address: quoteToken,
      abi: erc20Abi,
      functionName: "approve",
      args: [SOMI_USDSO_POOL, maxUint256],
      chainId: somniaShannon.id,
    });
    await waitForTransactionReceipt(wagmiConfig, { hash });
    return hash;
  }, [isHouseOwner, quoteToken, writeContractAsync]);

  return {
    chainEnabled,
    houseOwner,
    session,
    ownerLabel,
    sessionLabel,
    address,
    isConnected,
    isHouseOwner,
    wrongOwner: isConnected && chainEnabled && !isHouseOwner,
    approved,
    connecting,
    writing,
    quoteToken,
    stallLot,
    connectWallet,
    grantSession,
    revokeDesk,
    signVote,
    approveUsdso,
    refetchApproval: approvalReads.refetch,
  };
}
