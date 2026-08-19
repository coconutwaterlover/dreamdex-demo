import { NextResponse } from "next/server";
import { runKeeper } from "@/lib/server/keeper";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Heals a dropped Reactivity beat and mirrors armed desks onto the real book.
 * Safe to hit from anywhere — every action it takes is idempotent.
 */
async function handle() {
  try {
    return NextResponse.json(await runKeeper(), { headers: { "cache-control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message.split("\n")[0] : "Keeper failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
