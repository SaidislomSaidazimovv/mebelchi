import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// npm test runs the correctness suite only; benchmarks live behind npm run bench
// (vitest.bench.config.ts) so measurement noise never gates correctness.
export default defineConfig({
  // Shared packages export TS source directly (no build) — alias them so tests that reach the
  // app's pricing/adapter layer (e.g. the rich-Cell safety net) resolve @mebelchi/* like the app does.
  resolve: {
    alias: {
      "@mebelchi/schema": r("./packages/schema/src/index.ts"),
      "@mebelchi/pricing": r("./packages/pricing/src/index.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
