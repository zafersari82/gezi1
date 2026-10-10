import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");

test("M0: restoran dar ekranda menü tek sütuna düşer, grid taşmaz", () => {
  expect(css).toContain("grid-template-columns: minmax(0, 1fr);");
  expect(css).toContain(".restaurant-layout > *");
  expect(css).toContain(".menu-grid > *");
  expect(css).toContain("overflow-wrap: anywhere;");
});
