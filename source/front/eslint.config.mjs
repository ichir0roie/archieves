import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// https://nextjs.org/docs/app/api-reference/config/eslint#disabling-rules

const eslintConfig = [
  {
    // .next-test: テスト・確かめ用に別のビルド先で起こした next dev(next.config.ts の distDir)
    ignores: [
      ".next/**",
      ".next-test/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  ...compat.config({
    extends:["next/core-web-vitals", "next/typescript"],
    rules:{
      "@typescript-eslint/no-unused-vars": "off",
    }
  })
];

export default eslintConfig;
