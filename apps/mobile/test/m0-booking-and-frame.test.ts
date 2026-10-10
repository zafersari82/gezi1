import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

test("M0: randevu ekranı genel başlık ölçeğini kullanır", () => {
  const screen = read("../src/app/(app)/bookings/[businessId].tsx");
  expect(screen).toContain('<AppText variant="heading">Randevu al</AppText>');
  expect(screen).not.toContain('<AppText variant="title">');
});

test("M0: WebView yükleme hatası kullanıcı tekrar denemeden silinmez", () => {
  const frame = read("../src/features/miniapps/mini-app-frame.tsx");
  expect(frame).toContain("if (failed)");
  expect(frame).toContain("setRetryCount((count) => count + 1)");
  expect(frame).toContain("key={`${entryUrl}:${retryCount}`}");
  const webFrame = read("../src/features/miniapps/mini-app-frame.web.tsx");
  expect(webFrame).toContain("if (failed)");
  expect(webFrame).toMatch(/onError=\{\(\) => \{?\s*setFailed\(true\);?\s*\}?\}/);
});
