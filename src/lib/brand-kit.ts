import type { BrandKitLogo } from "@/lib/types";

const LOGO_NAME_FALLBACK = "Logo";

const trimString = (value: string | null | undefined) => value?.trim() ?? "";

export const inferLogoNameFromUrl = (url: string) => {
  const trimmed = trimString(url);
  if (!trimmed) {
    return LOGO_NAME_FALLBACK;
  }

  const withoutQuery = trimmed.split("?")[0] ?? trimmed;
  const encodedFileName = withoutQuery.split("/").filter(Boolean).pop();

  if (!encodedFileName) {
    return LOGO_NAME_FALLBACK;
  }

  try {
    return decodeURIComponent(encodedFileName);
  } catch {
    return encodedFileName;
  }
};

export const normalizeBrandKitLogos = (
  logos: BrandKitLogo[] | null | undefined,
  legacyLogoUrl?: string | null,
): BrandKitLogo[] => {
  const sourceLogos = Array.isArray(logos) ? logos : [];
  const normalized = sourceLogos.flatMap((logo, index) => {
    const url = trimString(logo?.url);
    if (!url) {
      return [];
    }

    const name = trimString(logo?.name) || inferLogoNameFromUrl(url);
    const id = trimString(logo?.id) || `logo-${index + 1}`;

    return [{ id, name, url }];
  });

  if (normalized.length > 0) {
    return normalized;
  }

  const fallbackUrl = trimString(legacyLogoUrl);
  if (!fallbackUrl) {
    return [];
  }

  return [
    {
      id: "legacy-logo",
      name: inferLogoNameFromUrl(fallbackUrl),
      url: fallbackUrl,
    },
  ];
};

export const getPrimaryBrandKitLogoUrl = (
  logos: BrandKitLogo[] | null | undefined,
  legacyLogoUrl?: string | null,
) => normalizeBrandKitLogos(logos, legacyLogoUrl)[0]?.url ?? null;

export const normalizeBrandKitRow = <
  T extends {
    logos?: BrandKitLogo[] | null;
    logoUrl?: string | null;
  },
>(
  row: T,
) => {
  const logos = normalizeBrandKitLogos(row.logos, row.logoUrl);

  return {
    ...row,
    logos,
    logoUrl: logos[0]?.url ?? null,
  };
};
