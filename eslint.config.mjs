import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import tseslint from "typescript-eslint";

/**
 * Tüm çalışma alanları için tek lint kuralı seti.
 * Biçimlendirme Prettier'a aittir; buradaki kurallar yalnızca kod kalitesini denetler.
 */
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.expo/**",
      "**/coverage/**",
      "**/expo-env.d.ts",
      "**/next-env.d.ts",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      eqeqeq: ["error", "always"],
      "no-console": "error",
      "no-restricted-exports": ["error", { restrictDefaultExports: { direct: true } }],
      "simple-import-sort/imports": "error",
      "simple-import-sort/exports": "error",
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/method-signature-style": ["error", "property"],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },

  // React kullanan çalışma alanları
  {
    files: ["apps/api/src/modules/{catalog,ordering,capabilities}/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [{ name: "pg", message: "Motor yalnızca kapsamlı erişim katmanını kullanır." }],
          patterns: [
            {
              group: ["**/platform-scope", "**/database-roles", "**/business-management.service"],
              message: "Motor platform yetkisi veya kapsam kurucusu kullanamaz.",
            },
            {
              group: ["**/tenant-scope"],
              importNames: ["authoriseTenant", "authoriseKitchenTenant"],
              message: "Motor kendine işletme kapsamı veremez.",
            },
            {
              group: ["**/outbox-events"],
              importNames: ["appendPlatformEvent"],
              message: "Motor genel platform kuyruğuna olay ekleyemez.",
            },
            {
              group: ["**/outbox-worker"],
              message: "Motor ayrıcalıklı olay dağıtıcısı kuramaz.",
            },
            {
              group: ["**/database"],
              importNames: ["createDatabase"],
              message: "Motor yeni havuz açamaz.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "apps/mobile/**/*.{ts,tsx}",
      "apps/portal/**/*.{ts,tsx}",
      "apps/business/**/*.{ts,tsx}",
      "miniapps/**/*.{ts,tsx}",
    ],
    extends: [reactHooks.configs.flat.recommended],
  },

  // Çatıların varsayılan dışa aktarım beklediği dosyalar
  {
    files: [
      "apps/mobile/src/app/**/*.tsx",
      "apps/portal/app/**/*.tsx",
      "apps/business/app/**/*.tsx",
      "**/*.config.{js,mjs,ts,mts}",
      "**/*.d.ts",
    ],
    rules: {
      "no-restricted-exports": "off",
    },
  },

  // Tarayıcıda çalışan kod
  {
    files: ["miniapps/**/*.{ts,tsx}", "packages/miniapp-sdk/**/*.ts"],
    languageOptions: { globals: globals.browser },
  },

  // Node.js betikleri ve yapılandırma dosyaları: tip bilgisi gerektiren kurallar kapalı
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["scripts/**/*.mjs", "apps/api/src/cli/**/*.ts", "apps/api/src/main.ts"],
    rules: {
      "no-console": "off",
    },
  },

  prettier,
  { files: ["apps/business/public/sw.js"], languageOptions: { globals: globals.browser } },
);
