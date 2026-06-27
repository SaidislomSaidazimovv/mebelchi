import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The shared packages export TypeScript source directly (no build step), so we
// alias them to source and let Vite transpile. fs.allow is widened to the repo
// root because those sources live above this app (../../packages, ../../engine).
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@mebelchi/schema": r("../../packages/schema/src/index.ts"),
      "@mebelchi/pricing": r("../../packages/pricing/src/index.ts"),
    },
  },
  server: {
    host: true,
    fs: { allow: [r("../../")] },
  },
});
