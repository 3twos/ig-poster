#!/usr/bin/env node

const BRIDGE_URL = "http://127.0.0.1:43123/v1/health";
const TIMEOUT_MS = 3000;

try {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const response = await fetch(BRIDGE_URL, {
    headers: { Accept: "application/json" },
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!response.ok) {
    console.log("Bridge returned HTTP", response.status);
    process.exit(1);
  }

  const health = await response.json();
  console.log("Bridge:", health.bridge?.origin ?? "unknown");
  console.log("App installed:", health.companionApp?.installed ?? false);
  console.log(
    "Selection:",
    health.selection?.assetCount ?? 0,
    "assets ready",
  );
} catch {
  console.log(
    "Bridge is not running. Install with: npm run companion:install",
  );
  process.exit(1);
}
