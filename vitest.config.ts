import { defineConfig } from "vitest/config";

// npm test runs the correctness suite only; benchmarks live behind npm run bench
// (vitest.bench.config.ts) so measurement noise never gates correctness.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
