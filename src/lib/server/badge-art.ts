import { arenaBadgeAbi } from "@/lib/chain/arena-badge-abi";
import {
  CONTRIBUTOR_BADGE_ADDRESS,
  DESK_BADGE_ADDRESS,
  isContributorBadgeConfigured,
  isDeskBadgeConfigured,
} from "@/lib/chain/constants";
import { FRUITS, appOrigin } from "@/lib/badge/fruits";
import { getPublicClient } from "./session";

export type BadgeKind = "desk" | "contributor";

/**
 * ERC-721 metadata served straight off the chain: the score is read live, so an
 * explorer always shows the holder's current standing rather than a mint-time copy.
 */
export async function badgeMetadata(kind: BadgeKind, tokenId: number) {
  const collection = kind === "desk" ? DESK_BADGE_ADDRESS : CONTRIBUTOR_BADGE_ADDRESS;
  const configured = kind === "desk" ? isDeskBadgeConfigured() : isContributorBadgeConfigured();
  const fruit = FRUITS[(Math.max(1, tokenId) - 1) % FRUITS.length];
  const origin = appOrigin();

  const base = {
    name: kind === "desk" ? `DreamDesk Desk #${tokenId}` : `DreamDesk Contributor #${tokenId}`,
    description:
      kind === "desk"
        ? "Soulbound badge for a DreamDesk Arena desk owner. Score is the desk's profit, read live from the arena contract."
        : "Soulbound badge for a DreamDesk Arena contributor. Score is every market call this wallet has made, settled in basis points.",
    image: `${origin}${fruit.src}`,
    external_url: origin,
    attributes: [
      { trait_type: "Kind", value: kind === "desk" ? "Desk owner" : "Contributor" },
      { trait_type: "Fruit", value: fruit.label },
      { trait_type: "Soulbound", value: "Yes" },
    ] as { trait_type: string; value: string | number }[],
  };

  if (!configured || !collection || !Number.isFinite(tokenId) || tokenId < 1) return base;

  try {
    const client = getPublicClient();
    const badge = { address: collection, abi: arenaBadgeAbi } as const;
    const [owner, handle, score] = await Promise.all([
      client.readContract({ ...badge, functionName: "ownerOf", args: [BigInt(tokenId)] }),
      client.readContract({ ...badge, functionName: "handleOf", args: [BigInt(tokenId)] }),
      client.readContract({ ...badge, functionName: "scoreOfToken", args: [BigInt(tokenId)] }),
    ]);
    const numeric = kind === "desk" ? Number(score) / 1e6 : Number(score);
    return {
      ...base,
      name: `${handle || base.name}`,
      attributes: [
        ...base.attributes,
        { trait_type: "Holder", value: owner },
        {
          trait_type: kind === "desk" ? "Profit (USDso)" : "Points",
          value: Number(numeric.toFixed(kind === "desk" ? 4 : 0)),
        },
      ],
    };
  } catch {
    return base;
  }
}
