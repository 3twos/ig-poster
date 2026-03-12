import { NextResponse } from "next/server";

import { attachPostDestinations } from "@/lib/post-destinations";
import { resolveActorFromRequest } from "@/services/actors";
import { getStoredPostDestinations } from "@/services/post-destinations";
import { duplicatePost } from "@/services/posts";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const actor = await resolveActorFromRequest(req);
    if (!actor) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await ctx.params;
    const duplicated = await duplicatePost(actor, id);
    if (!duplicated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const destinations = await getStoredPostDestinations(duplicated.id);
    return NextResponse.json({
      id: duplicated.id,
      post: attachPostDestinations(duplicated, destinations),
    });
  } catch (error) {
    console.error("[api/posts/id/duplicate]", error);
    return NextResponse.json(
      { error: "Failed to duplicate post" },
      { status: 500 },
    );
  }
}
