import { NextResponse } from "next/server";
import { DESK_BADGE_ADDRESS, isDeskBadgeConfigured } from "@/lib/chain/constants";
import { deskBadgeAbi } from "@/lib/chain/desk-badge-abi";
import { appOrigin, fruitForToken } from "@/lib/desk/fruits";
import { getPublicClient } from "@/lib/server/session";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id) || id === "0") {
    return NextResponse.json({ error: "Invalid token id" }, { status: 400 });
  }
  const tokenId = BigInt(id);
  const fruit = fruitForToken(tokenId);
  if (!fruit) return NextResponse.json({ error: "Unknown token" }, { status: 404 });

  const origin = appOrigin(request.url);
  const image = `${origin}${fruit.src}`;

  if (!isDeskBadgeConfigured() || !DESK_BADGE_ADDRESS) {
    return NextResponse.json({
      name: `DreamDesk ${fruit.label}`,
      description: "Soulbound DreamDesk fruit-stall badge. Score updates after every round.",
      image,
      attributes: [{ trait_type: "Fruit", value: fruit.label }],
    });
  }

  try {
    const client = getPublicClient();
    const [handle, score] = await Promise.all([
      client.readContract({
        address: DESK_BADGE_ADDRESS,
        abi: deskBadgeAbi,
        functionName: "playerName",
        args: [tokenId],
      }),
      client.readContract({
        address: DESK_BADGE_ADDRESS,
        abi: deskBadgeAbi,
        functionName: "playerScore",
        args: [tokenId],
      }),
    ]);
    return NextResponse.json({
      name: `${handle} · ${fruit.label}`,
      description: `Soulbound DreamDesk badge for ${handle}. Score lives on the token and updates after every round.`,
      image,
      attributes: [
        { trait_type: "Handle", value: handle },
        { trait_type: "Fruit", value: fruit.label },
        { trait_type: "Score", value: Number(score), display_type: "number" },
      ],
    });
  } catch {
    return NextResponse.json({ error: "Token not minted" }, { status: 404 });
  }
}
