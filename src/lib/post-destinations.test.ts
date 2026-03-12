import { describe, expect, it } from "vitest";

import {
  buildFallbackPostDestinationResources,
  buildPostDestinationResources,
  toPostDestinationResource,
} from "@/lib/post-destinations";

describe("toPostDestinationResource", () => {
  it("serializes stored destination rows into API-safe values", () => {
    expect(
      toPostDestinationResource({
        destination: "instagram",
        enabled: true,
        syncMode: "app_managed",
        desiredState: "scheduled",
        remoteState: "draft",
        caption: "Caption",
        firstComment: "First comment",
        locationId: "123",
        userTags: [{ username: "handle", x: 0.25, y: 0.75 }],
        publishAt: new Date("2026-03-12T20:00:00.000Z"),
        remoteObjectId: "media_1",
        remoteContainerId: "container_1",
        remotePermalink: "https://instagram.com/p/example",
        lastSyncedAt: new Date("2026-03-12T20:05:00.000Z"),
        lastError: null,
      }),
    ).toEqual({
      destination: "instagram",
      enabled: true,
      syncMode: "app_managed",
      desiredState: "scheduled",
      remoteState: "draft",
      caption: "Caption",
      firstComment: "First comment",
      locationId: "123",
      userTags: [{ username: "handle", x: 0.25, y: 0.75 }],
      publishAt: "2026-03-12T20:00:00.000Z",
      remoteObjectId: "media_1",
      remoteContainerId: "container_1",
      remotePermalink: "https://instagram.com/p/example",
      lastSyncedAt: "2026-03-12T20:05:00.000Z",
      lastError: null,
    });
  });
});

describe("buildFallbackPostDestinationResources", () => {
  it("builds sensible fallback destinations for legacy posts", () => {
    expect(
      buildFallbackPostDestinationResources({
        status: "posted",
        publishSettings: {
          caption: "Legacy caption",
          firstComment: "Legacy comment",
          locationId: "123",
          reelShareToFeed: true,
        },
        publishHistory: [
          {
            publishedAt: "2026-03-11T18:30:00.000Z",
            igMediaId: "media_1",
            igPermalink: "https://instagram.com/p/example",
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        destination: "facebook",
        enabled: false,
        desiredState: "published",
        remoteState: "published",
        caption: "Legacy caption",
      }),
      expect.objectContaining({
        destination: "instagram",
        enabled: true,
        desiredState: "published",
        remoteState: "published",
        firstComment: "Legacy comment",
        locationId: "123",
        remoteObjectId: "media_1",
        remotePermalink: "https://instagram.com/p/example",
        lastSyncedAt: "2026-03-11T18:30:00.000Z",
      }),
    ]);
  });

  it("preserves explicitly empty publish metadata values", () => {
    expect(
      buildFallbackPostDestinationResources({
        status: "draft",
        publishSettings: {
          caption: "",
          firstComment: "",
          locationId: "",
          reelShareToFeed: true,
        },
        publishHistory: [],
      }),
    ).toEqual([
      expect.objectContaining({
        destination: "facebook",
        caption: "",
      }),
      expect.objectContaining({
        destination: "instagram",
        caption: "",
        firstComment: "",
        locationId: "",
      }),
    ]);
  });
});

describe("buildPostDestinationResources", () => {
  it("prefers stored destination rows when they exist", () => {
    expect(
      buildPostDestinationResources(
        {
          status: "draft",
          publishSettings: {
            caption: "",
            firstComment: "",
            locationId: "",
            reelShareToFeed: true,
          },
          publishHistory: [],
        },
        [
          {
            destination: "facebook",
            enabled: true,
            syncMode: "remote_authoritative",
            desiredState: "scheduled",
            remoteState: "scheduled",
            caption: "Stored caption",
            firstComment: null,
            locationId: null,
            userTags: null,
            publishAt: new Date("2026-03-12T22:00:00.000Z"),
            remoteObjectId: "page_post_1",
            remoteContainerId: null,
            remotePermalink: "https://facebook.com/post",
            lastSyncedAt: null,
            lastError: null,
          },
        ],
      ),
    ).toEqual([
      expect.objectContaining({
        destination: "facebook",
        enabled: true,
        desiredState: "scheduled",
        remoteState: "scheduled",
        caption: "Stored caption",
      }),
      expect.objectContaining({
        destination: "instagram",
        enabled: true,
        desiredState: "draft",
      }),
    ]);
  });
});
