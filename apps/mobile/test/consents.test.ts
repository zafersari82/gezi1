import { describe, expect, it } from "vitest";

import {
  type ConsentMap,
  consentStatus,
  parseConsents,
  withConsent,
  withoutConsent,
} from "@/features/miniapps/consent-records";

const randevu = { id: "randevu", consentKey: "ozet-1" };
const updated = { id: "randevu", consentKey: "ozet-2" };

describe("mini uygulama izinleri", () => {
  it("verilen izin, mini uygulama değişmediği sürece geçerlidir", () => {
    const consents = withConsent({}, randevu, "identity.basic");
    expect(consentStatus(consents, randevu, "identity.basic")).toBe("granted");
    expect(consentStatus(consents, randevu, "location.coarse")).toBe("missing");
    expect(consentStatus(consents, { id: "baska", consentKey: "ozet-1" }, "identity.basic")).toBe(
      "missing",
    );
  });

  it("yetkiler ya da bağlanılan adresler değişince eski izin geçersiz sayılır", () => {
    const consents = withConsent({}, randevu, "identity.basic");
    expect(consentStatus(consents, updated, "identity.basic")).toBe("outdated");
  });

  it("yeniden verilen izin yalnızca sorulan yetkiyi kapsar; eskiler taşınmaz", () => {
    let consents = withConsent({}, randevu, "identity.basic");
    consents = withConsent(consents, randevu, "location.coarse");
    expect(consents.randevu?.granted).toEqual(["identity.basic", "location.coarse"]);

    consents = withConsent(consents, updated, "identity.basic");
    expect(consents.randevu).toEqual({ key: "ozet-2", granted: ["identity.basic"] });
    expect(consentStatus(consents, updated, "identity.basic")).toBe("granted");
    expect(consentStatus(consents, updated, "location.coarse")).toBe("missing");
  });

  it("aynı izni iki kez yazmaz; geri alınan izin kaldırılır", () => {
    let consents = withConsent({}, randevu, "identity.basic");
    consents = withConsent(consents, randevu, "identity.basic");
    consents = withConsent(consents, randevu, "camera.qr");
    expect(consents.randevu?.granted).toEqual(["identity.basic", "camera.qr"]);

    consents = withoutConsent(consents, "randevu", "identity.basic");
    expect(consents.randevu?.granted).toEqual(["camera.qr"]);
    consents = withoutConsent(consents, "randevu", "camera.qr");
    expect(consents).toEqual({});
    expect(withoutConsent(consents, "olmayan", "camera.qr")).toEqual({});
  });

  it("saklanan izinleri okur; bozuk ve tanınmayan kayıtları atlar", () => {
    const stored: ConsentMap = { randevu: { key: "ozet-1", granted: ["identity.basic"] } };
    expect(parseConsents(JSON.stringify(stored))).toEqual(stored);
    expect(parseConsents(null)).toEqual({});
    expect(parseConsents("{bozuk")).toEqual({});
    expect(parseConsents("[]")).toEqual({});
    expect(
      parseConsents(
        JSON.stringify({
          randevu: { key: "ozet-1", granted: ["identity.basic", "payment.request", 7] },
          bos: { key: "ozet-1", granted: [] },
          anahtarsiz: { granted: ["identity.basic"] },
        }),
      ),
    ).toEqual(stored);
  });

  it("2.2 ve öncesinin özetsiz izin kayıtlarını geçersiz sayar", () => {
    const legacy = JSON.stringify({ randevu: ["identity.basic", "location.coarse"] });
    const consents = parseConsents(legacy);
    expect(consents).toEqual({});
    expect(consentStatus(consents, randevu, "identity.basic")).toBe("missing");
  });
});
