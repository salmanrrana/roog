import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

// House rules that keep Beats' layers honest. See docs/beats-architecture.md.
const beatsBoundaries = {
  // core/ is pure domain logic: no React, stores, engine, persistence or panels.
  core: [
    {
      group: ["react", "react-dom", "zustand"],
      message: "core/ stays framework-free.",
    },
    {
      group: [
        "@/state/*",
        "@/engine/*",
        "@/persistence/*",
        "@/panels/*",
        "@/app/*",
        "@/ui/*",
      ],
      message: "core/ must not depend on outer layers.",
    },
  ],
  // A panel never reaches into another panel; share through core/, state/ or ui/.
  panels: [
    {
      group: ["@/panels/*"],
      message:
        "Panels must not import other panels. Use relative imports inside your own panel.",
    },
  ],
};

export default tseslint.config(
  { ignores: ["node_modules/**", "dist/**", ".netlify/**", "plans/**"] },

  // Legacy plain-JS pages (rack + studio).
  {
    files: ["src/*.js", "src/studio/**/*.js"],
    languageOptions: { globals: globals.browser, sourceType: "module" },
    rules: js.configs.recommended.rules,
  },
  {
    files: ["src/studio/dsp/worklets.js"],
    languageOptions: { globals: globals.audioWorklet },
  },
  {
    files: ["tests/**/*.js", "tools/**/*.mjs", "eslint.config.mjs"],
    languageOptions: { globals: globals.node, sourceType: "module" },
    rules: js.configs.recommended.rules,
  },

  // Beats (TypeScript + React).
  {
    files: ["src/beats/**/*.{ts,tsx}", "vite.config.ts"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        project: ["./tsconfig.json", "./tsconfig.node.json"],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },
  {
    files: ["src/beats/**/*.{ts,tsx}"],
    ...reactHooks.configs.flat["recommended-latest"],
  },
  {
    files: ["src/beats/core/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: beatsBoundaries.core }],
    },
  },
  {
    files: ["src/beats/panels/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: beatsBoundaries.panels }],
    },
  },
);
