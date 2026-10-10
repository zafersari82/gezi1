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

it.each([
  ["2026-01-15T22:30:00Z", "Europe/Istanbul", "16 Oca 01:30"],
  ["2026-01-15T22:30:00Z", "America/New_York", "15 Oca 17:30 · New York"],
  ["2026-07-15T22:30:00Z", "America/New_York", "15 Tem 18:30 · New York"],
])("%s saati cihaz yerine %s şubesinde gösterilir", (value, timezone, expected) => {
  expect(dateTime(value, timezone)).toBe(expected);
});
