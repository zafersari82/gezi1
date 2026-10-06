import type { Catalog } from "@vado/contracts";
import { expect, it } from "vitest";

import { dateTime, selectionProblem } from "../src/model";
const group: Catalog["optionGroups"][number] = {
  id: "grup",
  businessId: "isletme",
  name: "Boy",
  minSelected: 1,
  maxSelected: 1,
  active: true,
  options: [
    { id: "bir", groupId: "grup", name: "Küçük", priceDeltaMinor: 0, active: true, sortOrder: 0 },
    { id: "iki", groupId: "grup", name: "Büyük", priceDeltaMinor: 100, active: true, sortOrder: 1 },
  ],
};
it("zorunlu seçim boş bırakılamaz; en çok seçim, yabancı veya kapalı seçenek reddedilir", () => {
  expect(selectionProblem([group], [])).toContain("Boy");
  expect(selectionProblem([group], ["bir", "iki"])).toContain("Boy");
  expect(selectionProblem([group], ["yabancı"])).not.toBeNull();
  expect(selectionProblem([group], ["bir"])).toBeNull();
  expect(
    selectionProblem(
      [{ ...group, options: group.options.map((o) => ({ ...o, active: false })) }],
      ["bir"],
    ),
  ).not.toBeNull();
});

it("teslim saati seçilen şubenin saat dilimini açıkça taşır", () => {
  const value = dateTime("2026-01-01T00:00:00.000Z", "Europe/Istanbul");
  expect(value).toContain("03:00");
  expect(value).toContain("Europe/Istanbul");
});
