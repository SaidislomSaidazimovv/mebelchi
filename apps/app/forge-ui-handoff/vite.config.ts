import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "three/addons": path.resolve("./node_modules/three/examples/jsm"),
      three: path.resolve("./node_modules/three"),
    },
  },
  server: { host: true },
});
