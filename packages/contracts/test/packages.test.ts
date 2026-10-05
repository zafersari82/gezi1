import { describe, expect, it } from "vitest";

import {
  compareVersions,
  type ConfigField,
  configFieldSchema,
  isNetworkOrigin,
  isPackagePath,
  isSecureNetworkOrigin,
  packageContentType,
  packageDigestInput,
  packageManifestSchema,
  resolveConfig,
  versionSchema,
} from "../src";

describe("sürüm numarası", () => {
  it.each(["0.0.1", "1.0.0", "12.34.56", "99999.0.0"])("%s geçerlidir", (version) => {
    expect(versionSchema.safeParse(version).success).toBe(true);
  });

  it.each(["1.0", "1.0.0.0", "v1.0.0", "1.0.0-beta", "01.0.0", "1.00.0", "100000.0.0", ""])(
    "%s geçersizdir",
    (version) => {
      expect(versionSchema.safeParse(version).success).toBe(false);
    },
  );

  it("sayı olarak karşılaştırır, metin olarak değil", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBe(1);
    expect(compareVersions("2.0.0", "10.0.0")).toBe(-1);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
    expect(["1.10.0", "1.2.0", "1.9.9"].sort(compareVersions)).toEqual([
      "1.2.0",
      "1.9.9",
      "1.10.0",
    ]);
  });
});

describe("paket içi dosya yolu", () => {
  it.each(["index.html", "assets/app-D1x_2.js", "a/b/c/d/e/f/g/h.png", "vado.app.json"])(
    "%s geçerlidir",
    (path) => {
      expect(isPackagePath(path)).toBe(true);
    },
  );

  it.each([
    ["", "boş"],
    ["/index.html", "kökten başlayan"],
    ["../index.html", "üst klasör"],
    ["assets/../../x.js", "aradaki üst klasör"],
    ["./index.html", "nokta bölümü"],
    ["assets//app.js", "boş bölüm"],
    ["assets/", "klasör"],
    [".env", "gizli dosya"],
    ["assets/.DS_Store", "gizli dosya (alt klasörde)"],
    ["__MACOSX/._index.html", "macOS artığı"],
    ["dosya adı.html", "boşluk"],
    ["görsel.png", "ASCII dışı karakter"],
    ["assets\\app.js", "ters bölü"],
    ["index.html.", "noktayla biten"],
    ["a/b/c/d/e/f/g/h/i.png", "çok derin"],
    ["a".repeat(181), "çok uzun"],
    ["index.html\u0000.png", "boş karakter"],
  ])("%j geçersizdir (%s)", (path) => {
    expect(isPackagePath(path)).toBe(false);
  });

  it("içerik türünü uzantıdan belirler; bilinmeyen uzantıyı kabul etmez", () => {
    expect(packageContentType("index.html")).toBe("text/html; charset=utf-8");
    expect(packageContentType("assets/APP.JS")).toBe("text/javascript; charset=utf-8");
    expect(packageContentType("font.woff2")).toBe("font/woff2");
    expect(packageContentType("modul.wasm")).toBeNull();
    expect(packageContentType("sunucu.php")).toBeNull();
    expect(packageContentType("uzantisiz")).toBeNull();
    expect(packageContentType("constructor")).toBeNull();
  });
});

describe("bağlanılacak adres", () => {
  it.each(["https://api.ornek.com", "https://api.ornek.com:8443", "wss://canli.ornek.com"])(
    "%s geçerli ve şifrelidir",
    (origin) => {
      expect(isNetworkOrigin(origin)).toBe(true);
      expect(isSecureNetworkOrigin(origin)).toBe(true);
    },
  );

  it("şifresiz adresleri tanır ama şifreli saymaz", () => {
    expect(isNetworkOrigin("http://localhost:3001")).toBe(true);
    expect(isSecureNetworkOrigin("http://localhost:3001")).toBe(false);
    expect(isSecureNetworkOrigin("ws://localhost:3001")).toBe(false);
  });

  it.each([
    ["https://api.ornek.com/", "sondaki bölü"],
    ["https://api.ornek.com/v1", "yol"],
    ["https://*.ornek.com", "joker"],
    ["https://API.ornek.com", "büyük harf"],
    ["https://api.ornek.com:443", "varsayılan port"],
    ["https://kullanici@api.ornek.com", "kullanıcı adı"],
    ["api.ornek.com", "şemasız"],
    ["ftp://api.ornek.com", "başka şema"],
    ["*", "her yer"],
  ])("%s geçersizdir (%s)", (origin) => {
    expect(isNetworkOrigin(origin)).toBe(false);
  });
});

describe("bildirim dosyası", () => {
  const minimal = { manifest: 1, id: "randevu", version: "1.0.0", name: "Randevu" };

  it("en küçük bildirimi varsayılanlarla tamamlar", () => {
    expect(packageManifestSchema.parse(minimal)).toEqual({
      ...minimal,
      entry: "index.html",
      permissions: [],
      network: [],
      config: [],
    });
  });

  it("yetkileri, adresleri ve ayar alanlarını kabul eder", () => {
    const manifest = packageManifestSchema.parse({
      ...minimal,
      entry: "app/index.html",
      icon: "assets/icon.png",
      permissions: ["identity.basic", "payment.request"],
      network: ["https://api.ornek.com"],
      config: [{ key: "businessName", label: "İşletme adı", type: "text", required: true }],
    });
    expect(manifest.config[0]).toMatchObject({ key: "businessName", required: true });
    expect(manifest.icon).toBe("assets/icon.png");
  });

  it.each([
    ["tanımsız alan", { engine: "food" }],
    ["bilinmeyen bildirim sürümü", { manifest: 2 }],
    ["geçersiz kimlik", { id: "Randevu PRO" }],
    ["geçersiz sürüm", { version: "1.0" }],
    ["HTML olmayan giriş", { entry: "main.js" }],
    ["paketin dışına çıkan giriş", { entry: "../index.html" }],
    ["görsel olmayan simge", { icon: "index.html" }],
    ["paketin dışına çıkan simge", { icon: "../icon.png" }],
    ["bilinmeyen yetki", { permissions: ["contacts.read"] }],
    ["yinelenen yetki", { permissions: ["identity.basic", "identity.basic"] }],
    ["yollu adres", { network: ["https://api.ornek.com/v1"] }],
    ["joker adres", { network: ["https://*.ornek.com"] }],
    ["yinelenen adres", { network: ["https://a.ornek.com", "https://a.ornek.com"] }],
    [
      "yinelenen ayar anahtarı",
      {
        config: [
          { key: "ad", label: "Ad", type: "text" },
          { key: "ad", label: "Ad", type: "text" },
        ],
      },
    ],
  ])("reddeder: %s", (_label, override) => {
    expect(packageManifestSchema.safeParse({ ...minimal, ...override }).success).toBe(false);
  });
});

describe("ayar alanı", () => {
  it.each([
    ["seçeneksiz select", { key: "tur", label: "Tür", type: "select" }],
    [
      "seçenekli text",
      { key: "ad", label: "Ad", type: "text", options: [{ value: "a", label: "A" }] },
    ],
    ["sayıda uzunluk sınırı", { key: "adet", label: "Adet", type: "number", maxLength: 3 }],
    ["türe uymayan varsayılan", { key: "adet", label: "Adet", type: "number", default: "üç" }],
    [
      "listede olmayan varsayılan",
      {
        key: "tur",
        label: "Tür",
        type: "select",
        options: [{ value: "a", label: "A" }],
        default: "b",
      },
    ],
    [
      "yinelenen seçenek",
      {
        key: "tur",
        label: "Tür",
        type: "select",
        options: [
          { value: "a", label: "A" },
          { value: "a", label: "B" },
        ],
      },
    ],
    ["büyük harfle başlayan anahtar", { key: "Ad", label: "Ad", type: "text" }],
    ["tanımsız özellik", { key: "ad", label: "Ad", type: "text", pattern: ".*" }],
  ])("reddeder: %s", (_label, field) => {
    expect(configFieldSchema.safeParse(field).success).toBe(false);
  });
});

describe("ayarların doğrulanması", () => {
  const fields: ConfigField[] = [
    { key: "businessName", label: "İşletme adı", type: "text", required: true, maxLength: 20 },
    { key: "seats", label: "Koltuk sayısı", type: "number", required: false, default: 2 },
    { key: "walkIn", label: "Randevusuz kabul", type: "boolean", required: false },
    {
      key: "kind",
      label: "Tür",
      type: "select",
      required: true,
      options: [
        { value: "berber", label: "Berber" },
        { value: "guzellik", label: "Güzellik salonu" },
      ],
    },
    { key: "note", label: "Not", type: "text", required: false },
  ];

  it("geçerli değerleri alır, verilmeyenlere varsayılanı yazar, boş isteğe bağlıları atlar", () => {
    const result = resolveConfig(fields, {
      businessName: "Kadıköy Berber",
      walkIn: false,
      kind: "berber",
      note: "",
    });
    expect(result.problems).toEqual([]);
    expect(result.values).toEqual({
      businessName: "Kadıköy Berber",
      seats: 2,
      walkIn: false,
      kind: "berber",
    });
  });

  it("eksik zorunlu alanı, türe uymayan değeri ve tanınmayan anahtarı bildirir", () => {
    const result = resolveConfig(fields, {
      businessName: "",
      seats: "üç",
      walkIn: "evet",
      kind: "kafe",
      logo: "x.png",
    });
    expect(result.problems.map((problem) => problem.key).sort()).toEqual([
      "businessName",
      "kind",
      "logo",
      "seats",
      "walkIn",
    ]);
    expect(result.values).toEqual({});
  });

  it("uzunluk sınırını uygular", () => {
    const result = resolveConfig(fields, { businessName: "x".repeat(21), kind: "berber" });
    expect(result.problems).toEqual([
      { key: "businessName", message: "En çok 20 karakter olabilir." },
    ]);
  });

  it("alan bildirmeyen pakette her ayarı reddeder, boş ayarı kabul eder", () => {
    expect(resolveConfig([], {}).problems).toEqual([]);
    expect(resolveConfig([], { herhangi: 1 }).problems).toHaveLength(1);
  });
});

describe("içerik özeti girdisi", () => {
  const files = [
    { path: "index.html", sha256: "b".repeat(64), size: 120 },
    { path: "assets/app.js", sha256: "a".repeat(64), size: 4096 },
  ];

  it("dosyaları yol sırasıyla, her biri bir satırda yazar", () => {
    expect(packageDigestInput(files)).toBe(
      `${"a".repeat(64)}  4096  assets/app.js\n${"b".repeat(64)}  120  index.html\n`,
    );
  });

  it("dosyaların veriliş sırasından bağımsızdır ve girdiyi değiştirmez", () => {
    const reversed = [...files].reverse();
    expect(packageDigestInput(reversed)).toBe(packageDigestInput(files));
    expect(reversed[0]?.path).toBe("assets/app.js");
  });

  it("içerik, boyut ya da yol değişince değişir", () => {
    const base = packageDigestInput(files);
    const [first, second] = files;
    if (first === undefined || second === undefined) throw new Error("örnek dosyalar eksik");
    expect(packageDigestInput([{ ...first, sha256: "c".repeat(64) }, second])).not.toBe(base);
    expect(packageDigestInput([{ ...first, size: 121 }, second])).not.toBe(base);
    expect(packageDigestInput([{ ...first, path: "main.html" }, second])).not.toBe(base);
  });
});
