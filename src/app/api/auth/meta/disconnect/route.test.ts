import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/meta-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/meta-auth")>(
    "@/lib/meta-auth",
  );

  return {
    ...actual,
    deleteMetaConnection: vi.fn(),
  };
});

import { POST } from "@/app/api/auth/meta/disconnect/route";
import { deleteMetaConnection, META_CONNECTION_COOKIE } from "@/lib/meta-auth";

const mockedDeleteMetaConnection = vi.mocked(deleteMetaConnection);

describe("POST /api/auth/meta/disconnect", () => {
  beforeEach(() => {
    mockedDeleteMetaConnection.mockReset();
    mockedDeleteMetaConnection.mockResolvedValue(true);
  });

  it("deletes stored OAuth connections and clears the browser cookie", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/auth/meta/disconnect", {
        method: "POST",
        headers: {
          cookie: `${META_CONNECTION_COOKIE}=stored-connection-123`,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mockedDeleteMetaConnection).toHaveBeenCalledWith(
      "stored-connection-123",
    );
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(response.headers.get("set-cookie")).toContain(
      `${META_CONNECTION_COOKIE}=;`,
    );
  });

  it("skips deletion for inline-cookie connections but still clears the cookie", async () => {
    const response = await POST(
      new Request("https://app.example.com/api/auth/meta/disconnect", {
        method: "POST",
        headers: {
          cookie: `${META_CONNECTION_COOKIE}=inline%3Aencrypted-payload`,
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mockedDeleteMetaConnection).not.toHaveBeenCalled();
    expect(response.headers.get("set-cookie")).toContain(
      `${META_CONNECTION_COOKIE}=;`,
    );
  });

  it("returns a sanitized error when stored-connection cleanup fails", async () => {
    mockedDeleteMetaConnection.mockRejectedValue(new Error("storage offline"));

    const response = await POST(
      new Request("https://app.example.com/api/auth/meta/disconnect", {
        method: "POST",
        headers: {
          cookie: `${META_CONNECTION_COOKIE}=stored-connection-123`,
        },
      }),
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to disconnect",
      detail: "storage offline",
    });
  });
});
