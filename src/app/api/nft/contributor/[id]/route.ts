import { NextResponse } from "next/server";
import { badgeMetadata } from "@/lib/server/badge-art";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  return NextResponse.json(await badgeMetadata("contributor", Number(id)));
}
