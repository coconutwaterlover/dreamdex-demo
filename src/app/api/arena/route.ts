import { NextResponse } from "next/server";
import type { Address } from "viem";
import { emptySnapshot, readArena, readMyStakes, readMyVotes } from "@/lib/server/arena";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const snapshot = await readArena();
    const voter = new URL(request.url).searchParams.get("voter");
    const valid = voter && /^0x[a-fA-F0-9]{40}$/.test(voter);
    const [myVotes, myStakes] = await Promise.all([
      valid ? readMyVotes(voter as Address, snapshot.state.roundId, snapshot.state.deskCount) : {},
      valid ? readMyStakes(voter as Address, snapshot.state.roundId, snapshot.state.deskCount) : [],
    ]);
    return NextResponse.json(
      { ...snapshot, myVotes, myStakes },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message.split("\n")[0] : "Arena read failed";
    return NextResponse.json(
      { ...emptySnapshot(), myVotes: {}, myStakes: [], error: message },
      { status: 200, headers: { "cache-control": "no-store" } },
    );
  }
}
