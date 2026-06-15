import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

// Relative base so the built bundle works from any static host (GitHub Pages, LAN).
export default defineConfig({
  base: "./",
  server: {
    host: true, // bind 0.0.0.0 so a phone on the LAN can open it
    // The spike imports the engine (read-only) which lives outside this package.
    fs: { allow: [repoRoot] },
  },
  preview: { host: true },
});
