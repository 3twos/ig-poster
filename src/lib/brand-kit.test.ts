import { describe, expect, it } from "vitest";

import {
  getPrimaryBrandKitLogoUrl,
  inferLogoNameFromUrl,
  normalizeBrandKitLogos,
  normalizeBrandKitRow,
} from "@/lib/brand-kit";
import type { BrandKitLogo } from "@/lib/types";

describe("brand kit helpers", () => {
  it("normalizes a legacy single logo URL into a selectable logo list", () => {
    const logos = normalizeBrandKitLogos(
      [],
      "https://cdn.example.com/logos/wordmark-light.png?version=2",
    );

    expect(logos).toEqual([
      {
        id: "legacy-logo",
        name: "wordmark-light.png",
        url: "https://cdn.example.com/logos/wordmark-light.png?version=2",
      },
    ]);
  });

  it("keeps named logos and derives the primary logo URL from the first entry", () => {
    const logos = normalizeBrandKitLogos([
      {
        id: "logo-1",
        name: "Primary wordmark",
        url: "https://cdn.example.com/logos/wordmark.svg",
      },
      {
        id: "logo-2",
        name: "",
        url: "https://cdn.example.com/logos/icon-mark.png",
      },
    ]);

    expect(logos[0]?.name).toBe("Primary wordmark");
    expect(logos[1]?.name).toBe("icon-mark.png");
    expect(getPrimaryBrandKitLogoUrl(logos)).toBe(
      "https://cdn.example.com/logos/wordmark.svg",
    );
  });

  it("normalizes row payloads for clients that still rely on legacy logoUrl", () => {
    const row = normalizeBrandKitRow({
      id: "kit-1",
      name: "Acme",
      logos: [] as BrandKitLogo[],
      logoUrl: "https://cdn.example.com/logos/acme-black.svg",
    });

    expect(row.logoUrl).toBe("https://cdn.example.com/logos/acme-black.svg");
    expect(row.logos).toHaveLength(1);
    expect(row.logos[0]?.name).toBe("acme-black.svg");
  });

  it("extracts a safe display name from a logo URL", () => {
    expect(
      inferLogoNameFromUrl("https://cdn.example.com/logos/mark%20outline.png"),
    ).toBe("mark outline.png");
  });
});
