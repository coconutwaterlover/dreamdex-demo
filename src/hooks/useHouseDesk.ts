"use client";

import { useCallback, useMemo } from "react";
import { useAccount, useConnect, useReadContracts, useSwitchChain, useWriteContract } from "wagmi";
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
} from "@/lib/chain/constants";
import { shortAddress } from "@/lib/desk/round";

export function useHouseDesk() {
  const chainEnabled = isChainConfigured();
  const houseOwner = HOUSE_OWNER_ADDRESS;
  const session = SESSION_ADDRESS;

  const { address, isConnected, chainId } = useAccount();
  const { connectAsync, connectors, isPending: connecting } = useConnect();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync, isPending: writing } = useWriteContract();

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

  const approved = useMemo(() => {
    if (!chainEnabled) return undefined;
    const results = approvalReads.data;
    if (!results || results.length < 3) return undefined;
    if (results.some((r) => r.status !== "success")) return undefined;
    return results.every((r) => r.result === true);
  }, [approvalReads.data, chainEnabled]);

  const ownerLabel = houseOwner ? shortAddress(houseOwner) : FALLBACK_OWNER_LABEL;
  const sessionLabel = session ? shortAddress(session) : FALLBACK_SESSION_LABEL;

  const connectOwner = useCallback(async () => {
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
    connectOwner,
    grantSession,
    revokeDesk,
    refetchApproval: approvalReads.refetch,
  };
}
