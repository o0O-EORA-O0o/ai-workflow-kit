/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  build: { outDir: "dist", target: "es2022", sourcemap: false },
  preview: { port: 4173, strictPort: true },
  test: { include: ["tests/unit/**/*.test.ts"] },
});
