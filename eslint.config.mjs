import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**", "**/dist/**", "**/.next/**", "**/.expo/**", "**/build/**",
      "convex/_generated/**", "design/**", "legacy-engine/**", "services/engine/**",
      "**/playwright-report/**", "**/test-results/**", "**/*.config.js", "**/*.config.cjs",
      "apps/mobile/babel.config.js", "apps/mobile/metro.config.js"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "no-restricted-syntax": ["error", { selector: "Literal[value=/[\\u{1F300}-\\u{1FAFF}]/u]", message: "No emoji anywhere (design system)." }]
    }
  }
);
