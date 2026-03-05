import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { brandKits } from "@/db/schema";
import { hashEmail } from "@/lib/server-utils";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const ownerHash = hashEmail(session.email);
    const db = getDb();
    const [row] = await db
      .select()
      .from(brandKits)
      .where(and(eq(brandKits.id, id), eq(brandKits.ownerHash, ownerHash)))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch {
    return NextResponse.json(
      { error: "Failed to get brand kit" },
      { status: 500 },
    );
  }
}

export async function PUT(req: Request, { params }: Params) {
  try {
    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const ownerHash = hashEmail(session.email);
    const body = await req.json();
    const db = getDb();

    // Build update object with only provided fields
    const updateData: Partial<typeof brandKits.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.brand !== undefined) updateData.brand = body.brand;
    if (body.promptConfig !== undefined) updateData.promptConfig = body.promptConfig;
    if (body.logoUrl !== undefined) updateData.logoUrl = body.logoUrl;
    if (body.isDefault !== undefined) updateData.isDefault = body.isDefault;

    const [row] = await db
      .update(brandKits)
      .set(updateData)
      .where(and(eq(brandKits.id, id), eq(brandKits.ownerHash, ownerHash)))
      .returning();

    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch {
    return NextResponse.json(
      { error: "Failed to update brand kit" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const ownerHash = hashEmail(session.email);
    const db = getDb();

    await db
      .delete(brandKits)
      .where(and(eq(brandKits.id, id), eq(brandKits.ownerHash, ownerHash)));

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete brand kit" },
      { status: 500 },
    );
  }
}
