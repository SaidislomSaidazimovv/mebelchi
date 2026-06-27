import { defineConfig } from "vitest/config";

// Self-contained pricing suite. Run from the repo root with the root-installed
// vitest:  node_modules/.bin/vitest run --config packages/pricing/vitest.config.ts
export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
});
