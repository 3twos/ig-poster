import { z } from "zod";

import { normalizeBrandKitRow } from "@/lib/brand-kit";
import type { BrandKitRow } from "@/db/schema";

const BrandKitLogoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url(),
});

export const BrandKitResourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  brand: z.unknown().nullable(),
  promptConfig: z.unknown().nullable(),
  logos: z.array(BrandKitLogoSchema),
  logoUrl: z.string().url().nullable(),
  isDefault: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const BrandKitsListDataSchema = z.object({
  brandKits: z.array(BrandKitResourceSchema),
});

export const BrandKitDataSchema = z.object({
  brandKit: BrandKitResourceSchema,
});

export const toBrandKitResource = (row: BrandKitRow) => {
  const normalized = normalizeBrandKitRow(row);

  return {
    id: normalized.id,
    name: normalized.name,
    brand: normalized.brand ?? null,
    promptConfig: normalized.promptConfig ?? null,
    logos: normalized.logos,
    logoUrl: normalized.logoUrl ?? null,
    isDefault: normalized.isDefault,
    createdAt: normalized.createdAt.toISOString(),
    updatedAt: normalized.updatedAt.toISOString(),
  };
};
