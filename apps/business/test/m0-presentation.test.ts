import { expect, test } from "vitest";

import { buildMobileNavigation } from "../lib/mobile-navigation";
import { operationalDateTime, orderDisplayNumber } from "../lib/order-display";

const created = "2026-10-10T12:30:00.000Z";

test("M0: işletme saat diliminde teknik metin yok, farklı bölge şehirle gösterilir", () => {
  expect(operationalDateTime(created, "Europe/Istanbul")).toContain("15:30");
  expect(operationalDateTime(created, "Europe/Istanbul")).not.toContain("Europe/");
  expect(operationalDateTime(created, "Europe/Berlin")).toContain("Berlin");
  expect(operationalDateTime(created, "Europe/Berlin")).not.toContain("Europe/");
});

test("M0: sipariş ekranda dört okunabilir hane taşır", () => {
  expect(orderDisplayNumber("a7e8f6c0-b45d-48af-9213-f8415492afeb").slice(1)).toBe("AFEB");
});

test("M0: telefon menüsü önce siparişleri gösterir, en çok 5 öğe içerir", () => {
  const blocks = [
    { id: "orders", view: "orders" as const, title: "Siparişler", path: "/orders", states: [] },
    { id: "kitchen", view: "kitchen" as const, title: "Mutfak", path: "/kitchen", states: [] },
    { id: "catalog", view: "catalog" as const, title: "Ürünler", path: "/catalog", states: [] },
  ];
  const nav = buildMobileNavigation(blocks, true, false);
  expect(nav.primary.map((item) => item.title)).toEqual([
    "Siparişler",
    "Mutfak",
    "Mesajlar",
    "Ürünler",
  ]);
  expect(nav.primary.length + Number(nav.more.length > 0)).toBeLessThanOrEqual(5);
  expect(nav.primary.some((item) => item.title === "Randevular")).toBe(false);
  expect(nav.more.some((item) => item.title === "Mağaza tasarımı")).toBe(true);
});

test("M0: randevu işletmesinde sipariş ve mutfak menüsü gösterilmez", () => {
  const nav = buildMobileNavigation([], true, true);
  expect(nav.primary[0]?.title).toBe("Randevular");
  expect(nav.primary.some((item) => item.title === "Siparişler")).toBe(false);
  expect(nav.primary.some((item) => item.title === "Mutfak")).toBe(false);
});
