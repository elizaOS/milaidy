import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const miladyRoot = path.resolve(here, "../..");
const apiPort = Number(process.env.MILADY_API_PORT) || 31337;

export default defineConfig({
  root: here,
  base: "./",
  plugins: [tailwindcss(), react()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: [
      {
        find: /^@milady\/capacitor-(.*)/,
        replacement: path.resolve(
          miladyRoot,
          "apps/app/plugins/$1/src/index.ts",
        ),
      },
    ],
  },
  build: {
    outDir: path.resolve(here, "dist"),
    emptyOutDir: true,
    target: "es2022",
  },
  server: {
    host: true,
    port: 2140,
    strictPort: true,
    proxy: {
      "/api": {
        target: `http://localhost:${apiPort}`,
        changeOrigin: true,
      },
      "/ws": {
        target: `ws://localhost:${apiPort}`,
        ws: true,
      },
    },
    fs: {
      allow: [here, miladyRoot],
    },
  },
});
