import type { Address } from "viem";
import { DESK_BADGE_ADDRESS, isDeskBadgeConfigured } from "@/lib/chain/constants";
import { deskBadgeAbi } from "@/lib/chain/desk-badge-abi";
import { isExecutorConfigured, getPublicClient, writeSessionContract } from "./session";

export type BoardRow = {
  wallet: Address;
  name: string;
  score: number;
  tokenId: number;
};

export type SyncResult = {
  txHash: `0x${string}` | null;
  minted: Address[];
  deltas: { address: Address; name: string; delta: number; pts: number; tokenId: number | null }[];
  error?: string;
};

function emptyBoard(): BoardRow[] {
  return [];
}

export async function readBoard(): Promise<BoardRow[]> {
  if (!isDeskBadgeConfigured() || !DESK_BADGE_ADDRESS) return emptyBoard();
  const client = getPublicClient();
  const [wallets, names, scores, tokenIds] = await client.readContract({
    address: DESK_BADGE_ADDRESS,
    abi: deskBadgeAbi,
    functionName: "getBoard",
  });
  return wallets.map((wallet, i) => ({
    wallet,
    name: names[i] ?? "",
    score: Number(scores[i] ?? 0),
    tokenId: Number(tokenIds[i] ?? 0),
  }));
}

export async function hasBadge(wallet: Address): Promise<boolean> {
  if (!isDeskBadgeConfigured() || !DESK_BADGE_ADDRESS) return false;
  const client = getPublicClient();
  const id = await client.readContract({
    address: DESK_BADGE_ADDRESS,
    abi: deskBadgeAbi,
    functionName: "tokenOf",
    args: [wallet],
  });
  return id !== BigInt(0);
}

export async function syncBoard(
  players: { wallet: Address; name: string; score: number; isNew: boolean }[],
): Promise<SyncResult> {
  const minted = players.filter((p) => p.isNew).map((p) => p.wallet);
  const deltas = players.map((p) => ({
    address: p.wallet,
    name: p.name,
    delta: 0,
    pts: p.score,
    tokenId: null as number | null,
  }));

  if (!players.length) return { txHash: null, minted: [], deltas: [] };
  if (!isDeskBadgeConfigured() || !DESK_BADGE_ADDRESS) {
    return { txHash: null, minted: [], deltas, error: "Desk badge contract is not configured" };
  }
  if (!isExecutorConfigured()) {
    return { txHash: null, minted: [], deltas, error: "SESSION_PRIVATE_KEY is not set" };
  }

  try {
    const txHash = await writeSessionContract({
      address: DESK_BADGE_ADDRESS,
      abi: deskBadgeAbi,
      functionName: "syncPlayers",
      args: [
        players.map((p) => p.wallet),
        players.map((p) => p.name),
        players.map((p) => BigInt(p.score)),
      ],
    });
    const board = await readBoard();
    const byWallet = new Map(board.map((row) => [row.wallet.toLowerCase(), row]));
    return {
      txHash,
      minted,
      deltas: players.map((p) => {
        const row = byWallet.get(p.wallet.toLowerCase());
        return {
          address: p.wallet,
          name: row?.name || p.name,
          delta: 0,
          pts: row?.score ?? p.score,
          tokenId: row?.tokenId ?? null,
        };
      }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message.split("\n")[0] : "Badge sync failed";
    return { txHash: null, minted: [], deltas, error: message };
  }
}
