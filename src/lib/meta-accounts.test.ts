import { describe, expect, it } from "vitest";

import {
  buildMetaAccountKey,
  buildMetaDestinationCapabilities,
} from "@/lib/meta-accounts";

describe("buildMetaAccountKey", () => {
  it("uses the page and instagram ids when both are available", () => {
    expect(
      buildMetaAccountKey({
        pageId: "page-123",
        instagramUserId: "ig-123",
      }),
    ).toBe("page-123:ig-123");
  });

  it("falls back to the instagram id when no page id is present", () => {
    expect(
      buildMetaAccountKey({
        instagramUserId: "ig-123",
      }),
    ).toBe("ig-123");
  });
});

describe("buildMetaDestinationCapabilities", () => {
  it("marks facebook as remote-authoritative only when a page id is present", () => {
    expect(
      buildMetaDestinationCapabilities({
        pageId: "page-123",
        instagramUserId: "ig-123",
      }),
    ).toEqual({
      facebook: {
        destination: "facebook",
        publishEnabled: true,
        syncMode: "remote_authoritative",
        sourceOfTruth: "meta",
      },
      instagram: {
        destination: "instagram",
        publishEnabled: true,
        syncMode: "app_managed",
        sourceOfTruth: "app",
      },
    });
  });

  it("keeps facebook disabled when only instagram auth is available", () => {
    expect(
      buildMetaDestinationCapabilities({
        instagramUserId: "ig-123",
      }).facebook,
    ).toMatchObject({
      publishEnabled: false,
      syncMode: "remote_authoritative",
    });
  });

  it("allows callers to explicitly disable facebook publishing for a connected page", () => {
    expect(
      buildMetaDestinationCapabilities({
        pageId: "page-123",
        instagramUserId: "ig-123",
        facebookPublishEnabled: false,
      }).facebook,
    ).toMatchObject({
      publishEnabled: false,
      syncMode: "remote_authoritative",
    });
  });
});
