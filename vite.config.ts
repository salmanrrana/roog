import { fileURLToPath } from "node:url";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Multi-page app: the legacy rack (index), the modular Studio, and Beats (React + TS).
// Only Beats goes through React Compiler; the legacy pages are plain JS.
export default defineConfig({
  plugins: [
    react(),
    babel({
      include: /[\\/]src[\\/]beats[\\/].*\.tsx?$/,
      presets: [reactCompilerPreset()],
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: { "@": fromRoot("./src/beats") },
  },
  server: { port: 5173 },
  build: {
    target: "es2023",
    rolldownOptions: {
      input: {
        index: fromRoot("./index.html"),
        studio: fromRoot("./studio.html"),
        beats: fromRoot("./beats.html"),
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.js"],
    environment: "node",
  },
});
