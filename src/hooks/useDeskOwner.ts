"use client";

import { useMemo } from "react";
import { useReadContracts } from "wagmi";
import { operatorRegistryAbi } from "@/lib/chain/abi";
import { erc20Abi, poolAbi } from "@/lib/chain/pool-abi";
import {
  OPERATOR_REGISTRY,
  PLACE_ORDER_FOR,
  SESSION_ADDRESS,
  SOMI_USDSO_POOL,
  isHexAddress,
} from "@/lib/chain/constants";
import { formatUnits, type Address } from "viem";

/**
 * The owner-side setup a desk needs before its winning move can become a real order:
 * a session-key grant in the registry, plus a pool allowance so auto-pull can draw
 * the quote token from the owner's own wallet.
 */
export function useDeskOwner(owner?: string) {
  const enabled = isHexAddress(owner) && isHexAddress(SESSION_ADDRESS);

  const reads = useReadContracts({
    contracts: enabled
      ? [
          {
            address: OPERATOR_REGISTRY,
            abi: operatorRegistryAbi,
            functionName: "isGloballyApproved",
            args: [owner as Address, SESSION_ADDRESS as Address, PLACE_ORDER_FOR],
          },
          { address: SOMI_USDSO_POOL, abi: poolAbi, functionName: "getPoolParams" },
        ]
      : [],
    query: { enabled, refetchInterval: 8000 },
  });

  const granted = reads.data?.[0]?.result === true;
  const params = reads.data?.[1]?.result as
    | readonly [Address, Address, bigint, bigint, bigint, bigint, bigint]
    | undefined;
  const quoteToken = params?.[1];

  const tokenReads = useReadContracts({
    contracts:
      enabled && quoteToken
        ? [
            {
              address: quoteToken,
              abi: erc20Abi,
              functionName: "allowance",
              args: [owner as Address, SOMI_USDSO_POOL],
            },
            { address: quoteToken, abi: erc20Abi, functionName: "balanceOf", args: [owner as Address] },
          ]
        : [],
    query: { enabled: enabled && !!quoteToken, refetchInterval: 8000 },
  });

  return useMemo(() => {
    const allowance = (tokenReads.data?.[0]?.result as bigint | undefined) ?? BigInt(0);
    const balance = (tokenReads.data?.[1]?.result as bigint | undefined) ?? BigInt(0);
    return {
      enabled,
      granted,
      quoteToken,
      approved: allowance > BigInt(0),
      allowance,
      balance,
      balanceLabel: formatUnits(balance, 18),
      refetch: () => {
        void reads.refetch();
        void tokenReads.refetch();
      },
    };
  }, [enabled, granted, quoteToken, tokenReads.data, reads, tokenReads]);
}
