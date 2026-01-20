import nextConfig from "eslint-config-next";
import eslintConfigPrettier from "eslint-config-prettier";
import eslintPluginPrettier from "eslint-plugin-prettier";
import unusedImports from "eslint-plugin-unused-imports";

export default [
  // 검사 제외 대상
  {
    ignores: [
      "node_modules/",
      ".next/",
      "dist/",
      ".turbo/",
      "out/",
      "coverage/",
    ],
  },

  // Next.js 설정 (flat config)
  ...nextConfig,

  // Prettier 충돌 규칙 비활성화
  eslintConfigPrettier,

  // 커스텀 규칙
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    plugins: {
      prettier: eslintPluginPrettier,
      "unused-imports": unusedImports,
    },
    rules: {
      "prettier/prettier": [
        "warn",
        {
          semi: true,
          singleQuote: true,
          trailingComma: "all",
          printWidth: 100,
          tabWidth: 2,
          bracketSameLine: false,
        },
      ],
      "unused-imports/no-unused-imports": "warn",

      // 타입스크립트 unused-vars는 plugin으로 대체
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
];
