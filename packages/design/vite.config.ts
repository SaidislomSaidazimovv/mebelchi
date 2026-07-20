import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

// Three entry points → three static bundles → three URLs. Same core, three
// interaction models (DB/29 §4 Way 1). Relative base so any static host works.
export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        index: resolve(here, "index.html"),
        a: resolve(here, "a.html"),
        b: resolve(here, "b.html"),
        c: resolve(here, "c.html"),
      },
    },
  },
  server: {
    host: true, // bind 0.0.0.0 so a phone on the LAN can open it
    // The app imports @mebelchi/construction (read-only), which lives one level up.
    fs: { allow: [repoRoot] },
  },
  preview: { host: true },
});
