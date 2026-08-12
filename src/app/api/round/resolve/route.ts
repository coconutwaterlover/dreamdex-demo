import { NextResponse } from "next/server";
import { resolveRound } from "@/lib/server/rounds";

export async function POST() {
  try {
    const round = await resolveRound();
    return NextResponse.json(round);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed";
    console.error("[round/resolve]", message);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
