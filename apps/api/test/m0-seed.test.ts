import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

// Veritabanı sonucu ayrıca gerçek PostgreSQL ile doğrulanmalıdır; bu denetim kaynak sözleşmesidir.
test("M0: örnek berber mini uygulaması işletme örneğine bağlı ve tekrar edilebilir", () => {
  const code = readFileSync(fileURLToPath(new URL("../src/cli/seed.ts", import.meta.url)), "utf8");
  expect(code).toContain("insert into app_instances");
  expect(code).toContain("on conflict (business_id, mini_app_id, merchant_id)");
  expect(code).toContain("record.merchantId === MERCHANT_ID");
  expect(code).toContain("platformScope(context.platformDb");
});
