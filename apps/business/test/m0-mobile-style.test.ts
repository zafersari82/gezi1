import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

const css = readFileSync(fileURLToPath(new URL("../app/globals.css", import.meta.url)), "utf8");

test("M0: tutarlar tek satırda kalır ve telefon boyutuna göre ölçeklenir", () => {
  expect(css).toContain(".metrics strong,");
  expect(css).toContain("white-space: nowrap;");
  expect(css).toContain("font-size: clamp(13px, 3.8vw, 19px);");
});

test("M0: beşinci sekme Diğer ve açılır panel genişliği sınırlandırılır", () => {
  expect(css).toContain(".bottom-nav > .mobile-more");
  expect(css).toContain(".mobile-more-panel");
  expect(css).toContain("width: min(300px, calc(100vw - 16px));");
});
