import { NextResponse } from "next/server";
import { recoverMessageAddress } from "viem";
import { isVote, voteMessage } from "@/lib/desk/vote";
import { castBallot, getRoundSnapshot } from "@/lib/server/rounds";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      vote?: string;
      address?: string;
      message?: string;
      signature?: string;
      name?: string;
    };
    if (!body.vote || !isVote(body.vote) || !body.address || !body.message || !body.signature) {
      return NextResponse.json({ error: "Invalid vote payload" }, { status: 400 });
    }
    const current = await getRoundSnapshot();
    if (!current.id) return NextResponse.json({ error: "No open round" }, { status: 400 });
    const expected = voteMessage(current.id, body.vote);
    if (body.message !== expected) {
      return NextResponse.json({ error: "Vote message mismatch" }, { status: 400 });
    }
    const recovered = await recoverMessageAddress({
      message: body.message,
      signature: body.signature as `0x${string}`,
    });
    if (recovered.toLowerCase() !== body.address.toLowerCase()) {
      return NextResponse.json({ error: "Signature does not match wallet" }, { status: 401 });
    }
    const round = await castBallot(current.id, recovered, body.vote, body.name);
    const fresh = await getRoundSnapshot();
    return NextResponse.json({ ...fresh, tally: round.tally, ballots: round.ballots });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[round/vote]", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
