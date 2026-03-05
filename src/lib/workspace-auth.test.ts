import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  createWorkspaceSessionToken,
  sanitizeNextPath,
  verifyWorkspaceSessionToken,
} from "@/lib/workspace-auth";

describe("workspace-auth", () => {
  beforeEach(() => {
    vi.stubEnv("WORKSPACE_AUTH_SECRET", "test-secret");
    vi.stubEnv("GOOGLE_WORKSPACE_DOMAIN", "example.com");
  });

  it("sanitizes redirect next paths", () => {
    expect(sanitizeNextPath("/settings")).toBe("/settings");
    expect(sanitizeNextPath("https://evil.com")).toBe("/");
    expect(sanitizeNextPath("//evil.com/path")).toBe("/");
    expect(sanitizeNextPath(undefined)).toBe("/");
  });

  it("creates and verifies workspace session tokens", async () => {
    const token = await createWorkspaceSessionToken({
      sub: "user-1",
      email: "person@example.com",
      domain: "example.com",
    });

    const session = await verifyWorkspaceSessionToken(token);
    expect(session).not.toBeNull();
    expect(session?.email).toBe("person@example.com");
    expect(session?.domain).toBe("example.com");
  });

  it("rejects token if required domain changed", async () => {
    const token = await createWorkspaceSessionToken({
      sub: "user-2",
      email: "person@example.com",
      domain: "example.com",
    });

    vi.stubEnv("GOOGLE_WORKSPACE_DOMAIN", "other.com");
    const session = await verifyWorkspaceSessionToken(token);
    expect(session).toBeNull();
  });
});
