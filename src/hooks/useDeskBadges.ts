"use client";

import { useMemo } from "react";
import { useReadContract } from "wagmi";
import { DESK_BADGE_ADDRESS, isDeskBadgeConfigured } from "@/lib/chain/constants";
import { deskBadgeAbi } from "@/lib/chain/desk-badge-abi";
import { shortAddress } from "@/lib/desk/round";
import type { RoundBallot, ScoreDelta, Voter } from "@/lib/desk/types";

export type BadgeRow = {
  wallet: `0x${string}`;
  name: string;
  score: number;
  tokenId: number;
};

export function useDeskBadges(enabled: boolean, address?: string) {
  const ready = enabled && isDeskBadgeConfigured() && !!DESK_BADGE_ADDRESS;
  const query = useReadContract({
    address: DESK_BADGE_ADDRESS,
    abi: deskBadgeAbi,
    functionName: "getBoard",
    query: {
      enabled: ready,
      refetchInterval: 4000,
    },
  });
  const mine = useReadContract({
    address: DESK_BADGE_ADDRESS,
    abi: deskBadgeAbi,
    functionName: "tokenOf",
    args: address ? [address as `0x${string}`] : undefined,
    query: {
      enabled: ready && !!address,
    },
  });

  const rows: BadgeRow[] = useMemo(() => {
    const data = query.data;
    if (!data) return [];
    const [wallets, names, scores, tokenIds] = data;
    return wallets.map((wallet, i) => ({
      wallet,
      name: names[i] ?? "",
      score: Number(scores[i] ?? 0),
      tokenId: Number(tokenIds[i] ?? 0),
    }));
  }, [query.data]);

  function hasBadge(wallet?: string): boolean {
    if (!wallet) return false;
    const key = wallet.toLowerCase();
    if (address && key === address.toLowerCase() && mine.data !== undefined) {
      return mine.data !== BigInt(0);
    }
    return rows.some((row) => row.wallet.toLowerCase() === key);
  }

  return {
    rows,
    hasBadge,
    loading: ready && query.isPending,
    refetch: async () => {
      await Promise.all([query.refetch(), mine.refetch()]);
    },
    configured: ready,
  };
}

export function boardToVoters(
  rows: BadgeRow[],
  you: string | undefined,
  ballots: RoundBallot[],
  deltas: ScoreDelta[],
): Voter[] {
  const youKey = you?.toLowerCase();
  const voteBy = new Map(ballots.map((b) => [b.address.toLowerCase(), b.vote]));
  const deltaBy = new Map(deltas.map((d) => [d.address.toLowerCase(), d]));
  const seen = new Set<string>();
  const list: Voter[] = [];

  for (const row of rows) {
    const id = row.wallet.toLowerCase();
    seen.add(id);
    const d = deltaBy.get(id);
    list.push({
      id,
      name: youKey && id === youKey ? row.name || "You" : row.name || shortAddress(row.wallet),
      pts: d?.pts ?? row.score,
      vote: voteBy.get(id),
      delta: d?.delta,
      tokenId: d?.tokenId ?? row.tokenId,
    });
  }

  for (const d of deltas) {
    const id = d.address.toLowerCase();
    if (seen.has(id)) continue;
    list.push({
      id,
      name: youKey && id === youKey ? d.name || "You" : d.name || shortAddress(d.address),
      pts: d.pts,
      vote: voteBy.get(id),
      delta: d.delta,
      tokenId: d.tokenId ?? undefined,
    });
  }

  return list.sort((a, b) => b.pts - a.pts);
}
