import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

const css = readFileSync(fileURLToPath(new URL("../src/styles.css", import.meta.url)), "utf8");

test("M0: mağaza filtre ve ürün panelleri telefon genişliğine sığar", () => {
  expect(css).toContain(".chooser > *");
  expect(css).toContain("max-width: 100%;");
  expect(css).toContain("grid-template-columns: minmax(0, 1fr);");
});
