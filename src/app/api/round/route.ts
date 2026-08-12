import { NextResponse } from "next/server";
import { getRoundSnapshot } from "@/lib/server/rounds";

export async function GET() {
  try {
    const round = await getRoundSnapshot();
    return NextResponse.json(round);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}
