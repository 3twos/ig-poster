import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const srcPath = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": srcPath,
    },
  },
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: [
        "src/lib/blob-store.ts",
        "src/lib/creative.ts",
        "src/lib/generation-events.ts",
        "src/lib/meta.ts",
        "src/lib/workspace-auth.ts",
        "src/proxy.ts",
      ],
      thresholds: {
        lines: 50,
        functions: 45,
        branches: 30,
        statements: 50,
      },
    },
  },
});
