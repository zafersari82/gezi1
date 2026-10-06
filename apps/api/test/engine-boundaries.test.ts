import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";
import { expect, test } from "vitest";

test("motor platform yetkisi, kapsam kurucusu, olay dağıtıcısı ve ham havuz içe aktaramaz", async () => {
  const eslint = new ESLint({ cwd: fileURLToPath(new URL("../../../", import.meta.url)) });
  const cases = [
    ["Pool", "pg"],
    ["platformScope", "../../core/platform-scope"],
    ["authoriseTenant", "../../core/tenant-scope"],
    ["createDatabase", "../../core/database"],
    ["createOutboxWorker", "../../core/outbox-worker"],
    ["appendPlatformEvent", "../../core/outbox-events"],
    ["createBusinessManagementService", "../business-management/business-management.service"],
  ] as const;
  for (const [name, specifier] of cases) {
    const code = `import { ${name} } from "${specifier}"; export { ${name} };`;
    const result = await eslint.lintText(code, {
      filePath: "apps/api/src/modules/catalog/catalog.service.ts",
    });
    expect(
      result.flatMap((r) => r.messages).filter((m) => m.ruleId === "no-restricted-imports"),
      code,
    ).toHaveLength(1);
  }
});
