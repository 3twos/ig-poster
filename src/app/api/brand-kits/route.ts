import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { brandKits } from "@/db/schema";
import { hashEmail } from "@/lib/server-utils";
import { readWorkspaceSessionFromRequest } from "@/lib/workspace-auth";

export const runtime = "nodejs";

const randomId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(9)))
    .map((b) => b.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 18);

export async function GET(req: Request) {
  try {
    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ownerHash = hashEmail(session.email);
    const db = getDb();
    const rows = await db
      .select()
      .from(brandKits)
      .where(eq(brandKits.ownerHash, ownerHash))
      .orderBy(desc(brandKits.updatedAt))
      .limit(20);

    return NextResponse.json({ kits: rows });
  } catch {
    return NextResponse.json(
      { error: "Failed to list brand kits" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await readWorkspaceSessionFromRequest(req);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ownerHash = hashEmail(session.email);
    const body = await req.json().catch(() => ({}));
    const id = randomId();
    const now = new Date();

    const db = getDb();
    const [row] = await db
      .insert(brandKits)
      .values({
        id,
        ownerHash,
        name: body.name ?? "New Kit",
        brand: body.brand ?? null,
        promptConfig: body.promptConfig ?? null,
        logoUrl: body.logoUrl ?? null,
        isDefault: body.isDefault ?? false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return NextResponse.json({ id: row.id, kit: row });
  } catch {
    return NextResponse.json(
      { error: "Failed to create brand kit" },
      { status: 500 },
    );
  }
}
