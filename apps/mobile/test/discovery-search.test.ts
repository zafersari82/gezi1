import type { Business, MiniApp } from "@vado/contracts";
import { describe, expect, it } from "vitest";

import { searchDiscovery } from "@/features/discovery/search";

const business: Business = {
  id: "01", name: "İstanbul Pilavcısı", slug: "istanbul-pilavci", category: "food",
  description: "Tavuklu pilav ve ayran", city: "İstanbul", verified: true, status: "active",
};
const secondBusiness: Business = {
  ...business, id: "02", name: "Ankara Berber", slug: "ankara-berber", category: "beauty",
  description: "Saç ve sakal", city: "Ankara",
};
const miniApp: MiniApp = {
  id: "siparis-uygulamasi", name: "Pilav Sipariş", description: "Restoran siparişleri",
  iconUrl: null, category: "food", developerName: "VADO", verified: true,
  source: "package", version: "1.0.0", capabilities: [], entryUrl: "https://example.test/app",
  scope: ["https://example.test"], consentKey: "test",
};
const items = { businesses: [business, secondBusiness], miniApps: [miniApp] };
const find = (query: string, category: Business["category"] | null = null,
  kind: "all" | "business" | "miniapp" = "all") =>
  searchDiscovery({ ...items, query, category, kind });

describe("VADO keşif araması", () => {
  it("işletmeleri ve mini uygulamaları aynı sorguda döndürür", () => {
    const result = find("pilav");
    expect(result).toHaveLength(2);
    expect(result.map((item) => item.kind).sort()).toEqual(["business", "miniapp"]);
  });
  it("Türkçe büyük harfleri ve sözcük sırasını tolere eder", () => {
    expect(find("ISTANBUL PILAV")).toHaveLength(1);
    expect(find("AYRAN TAVUKLU")).toHaveLength(1);
    expect(find("restoran sipariş")).toHaveLength(1);
  });
  it("sektör ve sonuç türünü birlikte sınırlar", () => {
    expect(find("", "beauty", "business")).toHaveLength(1);
    expect(find("pilav", "food", "miniapp")).toHaveLength(1);
    expect(find("pilav", "beauty")).toHaveLength(0);
  });
  it("ad eşleşmesini açıklama eşleşmesinden önce gösterir", () => {
    expect(find("pilav")[0]).toMatchObject({ kind: "miniapp" });
  });
  it("boş sorgu tüm erişilebilir kayıtları döndürür", () => {
    expect(find("  ")).toHaveLength(3);
  });
});
