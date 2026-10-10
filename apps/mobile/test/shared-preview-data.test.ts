import type { BusinessDetail, MiniAppDetail } from "@vado/contracts";
import { describe, expect, it } from "vitest";

import {
  businessSharePreview,
  miniAppSharePreview,
} from "../src/features/sharing/shared-preview-data";

const ID = "550e8400-e29b-41d4-a716-446655440000";
const business = {
  id: ID,
  name: "Eski isim",
  description: "Eski açıklama",
  city: "Hatay",
  verified: true,
  storefront: {
    title: "Güncel Mağaza",
    tagline: "Taze ve sıcak",
    logoUrl: "https://static.example.test/logo.webp",
    coverUrl: "https://static.example.test/cover.webp",
    templateId: "restaurant-classic",
    palette: "teal",
  },
  privateToken: "asla karta yansımaz",
} as unknown as BusinessDetail;

const miniApp = {
  id: "restaurant-v2",
  name: "VADO Yemek",
  description: "Yemek siparişleri",
  iconUrl: null,
  verified: true,
  entryUrl: "https://internal.example.test/private",
} as MiniAppDetail;

describe("S4 güvenli paylaşım önizlemeleri", () => {
  it("işletme vitrininde yalnız yayınlanan başlık ve logoyu kullanır", () => {
    const data = businessSharePreview({ kind: "business", id: ID }, business);
    expect(data.title).toBe("Güncel Mağaza");
    expect(data.imageUrl).toBe("https://static.example.test/logo.webp");
    expect(JSON.stringify(data)).not.toContain("privateToken");
    expect(JSON.stringify(data)).not.toContain("cover.webp");
  });
  it("yayın yoksa herkese açık işletme adına döner", () => {
    const data = businessSharePreview(
      { kind: "business", id: ID },
      { ...business, storefront: null },
    );
    expect(data.title).toBe("Eski isim");
    expect(data.imageUrl).toBeNull();
  });
  it("mini uygulama kartında özel çalıştırma adresini paylaşmaz", () => {
    const data = miniAppSharePreview({ kind: "miniapp", id: miniApp.id }, miniApp);
    expect(data.title).toBe("VADO Yemek");
    expect(JSON.stringify(data)).not.toContain("internal.example.test");
  });
  it("yanlış işletme veya mini uygulama kimliğini reddeder", () => {
    expect(() => businessSharePreview({ kind: "business", id: "wrong" }, business)).toThrow();
    expect(() => miniAppSharePreview({ kind: "miniapp", id: "other-app" }, miniApp)).toThrow();
  });
});
