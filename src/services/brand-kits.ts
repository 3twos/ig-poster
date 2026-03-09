import { and, desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { brandKits } from "@/db/schema";
import type { Actor } from "@/services/actors";

export const listBrandKits = async (actor: Actor) => {
  const db = getDb();
  return db
    .select()
    .from(brandKits)
    .where(eq(brandKits.ownerHash, actor.ownerHash))
    .orderBy(desc(brandKits.updatedAt))
    .limit(20);
};

export const getBrandKit = async (actor: Actor, id: string) => {
  const db = getDb();
  const [row] = await db
    .select()
    .from(brandKits)
    .where(and(eq(brandKits.id, id), eq(brandKits.ownerHash, actor.ownerHash)))
    .limit(1);

  return row ?? null;
};
