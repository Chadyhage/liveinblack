import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-broken-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".design-sync/**",
    // Prototype historique gelé et artefacts d'audit locaux.
    "old/**",
    "tmp/**",
    ".pnpm-store/**",
  ]),
]);

export default eslintConfig;
