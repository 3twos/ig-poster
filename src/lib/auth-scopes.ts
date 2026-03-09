export const WORKSPACE_SCOPES = [
  "posts:read",
  "posts:write",
  "assets:write",
  "brand-kits:read",
  "queue:read",
  "queue:write",
  "api:raw",
] as const;

export type WorkspaceScope = (typeof WORKSPACE_SCOPES)[number];
