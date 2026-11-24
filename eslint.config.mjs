import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // CI runs the e2e tests without the publishable key, so test files may only import
  // site code that never loads src/lib/supabase/env.ts (one bad import stops the whole run).
  {
    files: ["e2e/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^(@/|(\.\./)+src/)(?!lib/booking-time$|lib/format$|types/)",
              message: "e2e may import only src/lib/booking-time, src/lib/format and src/types (CI has no publishable key).",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Playwright output (git-ignored; the HTML report bundles its own minified trace viewer)
    "playwright-report/**",
    "test-results/**",
    "blob-report/**",
  ]),
]);

export default eslintConfig;
