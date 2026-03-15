import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  base: "./",
  publicDir: path.resolve(here, "public"),
  plugins: [tailwindcss(), react()],
  build: {
    outDir: path.resolve(here, "dist"),
    emptyOutDir: true,
    sourcemap: true,
    target: "es2022",
  },
  server: {
    host: true,
    port: 2139,
    strictPort: true,
  },
});
