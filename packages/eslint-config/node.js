import js from "@eslint/js";
import globals from "globals";
import eslintPluginPrettier from "eslint-plugin-prettier";
import eslintConfigPrettier from "eslint-config-prettier";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";

export default [
  // 검사 제외 대상
  {
    ignores: ["node_modules/", "dist/", ".turbo/", "coverage/"],
  },

  // ESLint 기본 권장
  js.configs.recommended,

  // TypeScript 지원
  ...tseslint.configs.recommended,

  // Prettier 충돌 규칙 비활성화
  eslintConfigPrettier,

  // 커스텀 규칙
  {
    files: ["**/*.{js,ts}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: globals.node,
    },
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
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
];
