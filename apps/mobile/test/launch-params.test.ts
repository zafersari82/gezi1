import { describe, expect, it } from "vitest";

import { launchParams, launchQr, rememberLaunch } from "@/features/miniapps/launch-params";

describe("QR açılış parametreleri", () => {
  it("okutulan kodun parametreleri yalnızca açılış anahtarıyla ve aynı kayıt için okunur", () => {
    const key = rememberLaunch("randevu", { masa: "12" });
    expect(launchParams("randevu", key)).toEqual({ masa: "12" });
    // Ekran yeniden çizildiğinde aynı parametreler okunur.
    expect(launchParams("randevu", key)).toEqual({ masa: "12" });
    expect(launchParams("baska-kayit", key)).toEqual({});
    expect(launchParams("randevu", undefined)).toEqual({});
    // Bir bağlantı anahtar uydurarak parametre veremez.
    expect(launchParams("randevu", "uydurma")).toEqual({});
  });

  it("bellekte en fazla sekiz açılış kalır; eskileri silinir", () => {
    const first = rememberLaunch("randevu", { sira: "0" });
    const keys = Array.from({ length: 8 }, (_, index) =>
      rememberLaunch("randevu", { sira: String(index + 1) }),
    );
    expect(launchParams("randevu", first)).toEqual({});
    expect(launchParams("randevu", keys[0])).toEqual({ sira: "1" });
    expect(launchParams("randevu", keys[7])).toEqual({ sira: "8" });
  });
});

it("masa katılımı için ham QR yalnız aynı açılıştan alınır; parametre metni yerine geçmez", () => {
  const key = rememberLaunch("restoran", { masa: "12" }, "imzali-qr");
  expect(launchQr("restoran", key)).toBe("imzali-qr");
  expect(launchQr("baska", key)).toBeNull();
  expect(launchQr("restoran", rememberLaunch("restoran", { masa: "12" }))).toBeNull();
});
