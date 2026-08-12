import { NextResponse } from "next/server";
import { openRound } from "@/lib/server/rounds";

export async function POST() {
  try {
    const round = await openRound();
    return NextResponse.json(round);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
