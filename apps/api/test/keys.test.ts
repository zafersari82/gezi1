import { spawnSync } from "node:child_process";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  adminMiniAppSchema,
  authResultSchema,
  issuedQrSchema,
  miniAppIdentitySchema,
  QR_PREFIX,
  qrTargetSchema,
  requestOtpResponseSchema,
  TERMS_VERSION,
} from "@vado/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { runKeyCommand } from "../src/cli/key-commands";
import { sql } from "../src/core/database";
import {
  describeKeyring,
  generateKeys,
  migrateKeys,
  rotateKeyring,
  toKeyEnv,
  utcDay,
} from "../src/core/key-management";
import {
  createAppKeys,
  createKeyring,
  DAY_MS,
  formatKeyring,
  type KeyConfig,
  type KeyEntry,
  type KeyEnv,
  LEGACY_KEY_ID,
  legacyKey,
  loadKeyConfig,
  parseKeyring,
} from "../src/core/keys";
import {
  anonymous,
  as,
  asAdmin,
  createUser,
  randomPhone,
  startTestApp,
  type TestApp,
  type TestUser,
} from "./support/harness";

/** 2.1 kurulumunun `VADO_APP_SECRET` değeri yerine geçen örnek ana anahtar. */
const APP_SECRET = "2.1-kurulumunun-ana-anahtari-0123456789";
/** 2.1 ve öncesinin geliştirme varsayılanı. Değişirse eski geliştirme verisi geçersiz kalır. */
const DEV_APP_SECRET = "vado-development-secret-not-for-production";
const NOW = Date.parse("2026-10-04T09:00:00Z");

/** Testler arasında değişmeyen, rastgele görünen 256 bitlik anahtar. */
const key = (seed: string) => createHash("sha256").update(seed).digest();
const hex = (seed: string) => key(seed).toString("hex");
const entry = (id: string, seed: string, validThrough: string | null = null): KeyEntry => ({
  id,
  key: key(seed),
  validThrough,
});
const at = (time: string) => () => Date.parse(time);

/**
 * 2.1 ve öncesinin imzalama yöntemi; o sürümdeki kodun bağımsız bir kopyasıdır. Yeni sistemin eski
 * imzaları ve kimlikleri tanıdığı, yeni kodu kullanmayan bu işlevle sınanır.
 */
function legacySign(appSecret: string, purpose: "otp" | "qr" | "openid", value: string): string {
  const derived = createHmac("sha256", appSecret).update(`vado:${purpose}`).digest();
  return createHmac("sha256", derived).update(value).digest("base64url");
}

function load(env: KeyEnv, production = true) {
  const problems: string[] = [];
  return { keys: loadKeyConfig(env, production, problems), problems };
}

/** Anahtarların kabul edildiğini varsayar; edilmezse sorunlarla birlikte testi düşürür. */
function mustLoad(env: KeyEnv, production = true): KeyConfig {
  const { keys, problems } = load(env, production);
  if (keys === null) throw new Error(problems.join("\n"));
  return keys;
}

const VALID: KeyEnv = {
  VADO_OTP_KEYS: `k1:${hex("otp")}`,
  VADO_QR_KEYS: `k1:${hex("qr")}`,
  VADO_OPENID_KEY: hex("openid"),
};

describe("anahtar halkası", () => {
  it("güncel anahtarla imzalar; imza anahtarın kimliğini taşır", () => {
    const ring = createKeyring([entry("k2", "yeni"), entry("k1", "eski")]);
    const signature = ring.sign("veri");
    expect(signature.startsWith("k2.")).toBe(true);
    expect(ring.verify("veri", signature)).toEqual({ keyId: "k2", current: true });
  });

  it("değişen veriyi, değişen imzayı ve bilinmeyen anahtar kimliğini reddeder", () => {
    const ring = createKeyring([entry("k1", "anahtar")]);
    const signature = ring.sign("veri");
    expect(ring.verify("veri2", signature)).toBeNull();
    expect(ring.verify("veri", `${signature}x`)).toBeNull();
    expect(ring.verify("veri", signature.replace("k1.", "k9."))).toBeNull();
    expect(ring.verify("veri", "k1.")).toBeNull();
    expect(ring.verify("veri", "")).toBeNull();
  });

  it("halkadaki eski anahtarın imzasını doğrular ve güncel olmadığını bildirir", () => {
    const before = createKeyring([entry("k1", "eski")]);
    const after = createKeyring([entry("k2", "yeni"), entry("k1", "eski")]);
    expect(after.verify("veri", before.sign("veri"))).toEqual({ keyId: "k1", current: false });
  });

  it("halkadan çıkarılan anahtarın imzasını reddeder", () => {
    const before = createKeyring([entry("k1", "eski")]);
    const after = createKeyring([entry("k2", "yeni")]);
    expect(after.verify("veri", before.sign("veri"))).toBeNull();
  });

  it("aynı kimliği taşısa da başka halkanın imzasını kabul etmez", () => {
    const otp = createKeyring([entry("k1", "otp")]);
    const qr = createKeyring([entry("k1", "qr")]);
    expect(qr.verify("veri", otp.sign("veri"))).toBeNull();
  });

  it("eski anahtar son geçerlilik gününün sonuna kadar doğrular, sonra doğrulamaz", () => {
    const signature = createKeyring([entry("k1", "eski")]).sign("veri");
    const entries = [entry("k2", "yeni"), entry("k1", "eski", "2026-12-31")];

    const lastMoment = createKeyring(entries, at("2026-12-31T23:59:59.999Z"));
    expect(lastMoment.verify("veri", signature)).toEqual({ keyId: "k1", current: false });
    const nextDay = createKeyring(entries, at("2027-01-01T00:00:00.000Z"));
    expect(nextDay.verify("veri", signature)).toBeNull();
    // Süresi dolan yalnızca eski anahtardır; güncel anahtar imzalamayı ve doğrulamayı sürdürür.
    expect(nextDay.verify("veri", nextDay.sign("veri"))).toEqual({ keyId: "k2", current: true });
  });

  it("kimlik taşımayan imzayı yalnızca legacy anahtarıyla doğrular", () => {
    const signature = legacySign(APP_SECRET, "qr", "veri");
    const legacy = { id: LEGACY_KEY_ID, key: legacyKey(APP_SECRET, "qr"), validThrough: null };

    const ring = createKeyring([entry("k1", "yeni"), legacy]);
    expect(ring.verify("veri", signature)).toEqual({ keyId: "legacy", current: false });
    expect(createKeyring([entry("k1", "yeni")]).verify("veri", signature)).toBeNull();
    // Aynı imzanın "legacy." önekiyle ikinci bir yazımı kabul edilmez.
    expect(ring.verify("veri", `${LEGACY_KEY_ID}.${signature}`)).toBeNull();
  });

  it.each<[string, KeyEntry[]]>([
    ["boş halka", []],
    ["ilk anahtar legacy", [entry(LEGACY_KEY_ID, "a")]],
    ["imzalayan anahtarda son geçerlilik günü", [entry("k1", "a", "2030-01-01")]],
    ["yinelenen kimlik", [entry("k1", "a"), entry("k1", "b")]],
    ["yinelenen anahtar", [entry("k2", "a"), entry("k1", "a")]],
    ["kısa anahtar", [{ id: "k1", key: key("a").subarray(0, 16), validThrough: null }]],
    ["rastgele olmayan anahtar", [{ id: "k1", key: Buffer.alloc(32, 7), validThrough: null }]],
    ["takvimde olmayan gün", [entry("k2", "a"), entry("k1", "b", "2026-02-30")]],
    ["bozuk tarih", [entry("k2", "a"), entry("k1", "b", "31.12.2026")]],
    ["büyük harfli kimlik", [entry("K1", "a")]],
    ["noktalı kimlik", [entry("k.1", "a")]],
  ])("geçersiz halkayı kurmaz: %s", (_label, entries) => {
    expect(() => createKeyring(entries)).toThrow("Anahtar halkası geçersiz");
  });
});

describe("anahtar halkasının yazımı", () => {
  it("halkayı çözümler ve aynı biçimde geri yazar", () => {
    const text = `k2:${hex("b")},k1:${hex("a")}:2027-01-31,legacy:${hex("c")}`;
    const { entries, problems } = parseKeyring(text);
    expect(problems).toEqual([]);
    expect(entries.map(({ id, validThrough }) => [id, validThrough])).toEqual([
      ["k2", null],
      ["k1", "2027-01-31"],
      ["legacy", null],
    ]);
    expect(formatKeyring(entries)).toBe(text);
  });

  it("boşlukları ve fazladan virgülü hoş görür", () => {
    const { entries, problems } = parseKeyring(` k2:${hex("b")} , k1:${hex("a")} ,`);
    expect(problems).toEqual([]);
    expect(entries.map((item) => item.id)).toEqual(["k2", "k1"]);
  });

  it.each([
    ["boş değer", ""],
    ["kimlik yazılmamış", hex("a")],
    ["anahtar yazılmamış", "k1:"],
    ["fazladan alan", `k1:${hex("a")}:2027-01-31:fazla`],
    ["hex olmayan anahtar", `k1:${"z".repeat(64)}`],
    ["tek sayıda hex karakter", `k1:${hex("a")}a`],
    ["kısa anahtar", `k1:${hex("a").slice(0, 32)}`],
    ["yinelenen desen", `k1:${"0123456789abcdef".repeat(4)}`],
    ["sonraki anahtar bozuk", `k2:${hex("b")},k1`],
  ])("bozuk yazımı reddeder: %s", (_label, text) => {
    const { entries, problems } = parseKeyring(text);
    expect(problems).not.toEqual([]);
    expect(entries).toEqual([]);
  });

  it("sorun bildirirken anahtarı yazmaz", () => {
    // Kimlik unutulmuş: ilk alan kimlik sanılan bir anahtardır ve iletide görünmemelidir.
    const secret = hex("gizli");
    const short = hex("kisa").slice(0, 32);
    const messages = [
      ...parseKeyring(`${secret}:${hex("b")}`).problems,
      ...parseKeyring(`k1:${short}`).problems,
      ...parseKeyring(`k2:${secret},k1:${secret}`).problems,
    ].join("\n");
    expect(messages).not.toBe("");
    expect(messages).not.toContain(secret);
    expect(messages).not.toContain(short);
  });
});

describe("anahtar yapılandırması", () => {
  it("canlı ortamda üç aile de tanımlıysa kabul eder", () => {
    const { keys, problems } = load(VALID);
    expect(problems).toEqual([]);
    expect(keys?.otp.map((item) => item.id)).toEqual(["k1"]);
    expect(keys?.openId.toString("hex")).toBe(hex("openid"));
  });

  it.each(["VADO_OTP_KEYS", "VADO_QR_KEYS", "VADO_OPENID_KEY"] as const)(
    "canlı ortamda %s yoksa reddeder ve nasıl üretileceğini söyler",
    (name) => {
      for (const missing of [undefined, "", "   "]) {
        const { keys, problems } = load({ ...VALID, [name]: missing });
        expect(keys).toBeNull();
        expect(problems).toHaveLength(1);
        expect(problems[0]).toContain(`${name} tanımlı değil`);
        expect(problems[0]).toContain("keys generate");
        expect(problems[0]).toContain("keys migrate");
      }
    },
  );

  it("canlı ortamda geliştirme anahtarlarını reddeder", () => {
    const { keys, problems } = load(toKeyEnv(mustLoad({}, false)));
    expect(keys).toBeNull();
    expect(problems).toHaveLength(3);
    for (const problem of problems) expect(problem).toContain("geliştirme anahtarı");
  });

  it.each<[string, KeyEnv]>([
    ["iki halkada", { VADO_QR_KEYS: `k1:${hex("otp")}` }],
    ["halkada ve kimlik anahtarında", { VADO_OPENID_KEY: hex("qr") }],
    ["eski bir halka anahtarında", { VADO_OTP_KEYS: `k2:${hex("yeni")},k1:${hex("openid")}` }],
  ])("bir anahtarın iki ailede kullanılmasını reddeder: %s", (_label, override) => {
    for (const production of [true, false]) {
      const { keys, problems } = load({ ...VALID, ...override }, production);
      expect(keys).toBeNull();
      expect(problems.join("\n")).toContain("her ailenin anahtarı ayrı olmalıdır");
    }
  });

  it.each<[string, KeyEnv]>([
    ["kısa kimlik anahtarı", { VADO_OPENID_KEY: hex("openid").slice(0, 40) }],
    ["hex olmayan kimlik anahtarı", { VADO_OPENID_KEY: "x".repeat(64) }],
    ["yinelenen desenli kimlik anahtarı", { VADO_OPENID_KEY: "ab".repeat(32) }],
    ["kısa halka anahtarı", { VADO_OTP_KEYS: `k1:${hex("otp").slice(0, 32)}` }],
    ["legacy ile başlayan halka", { VADO_QR_KEYS: `legacy:${hex("qr")}` }],
    ["süreli imza anahtarı", { VADO_QR_KEYS: `k1:${hex("qr")}:2030-01-01` }],
  ])("geçersiz anahtarı her ortamda reddeder: %s", (_label, override) => {
    for (const production of [true, false]) {
      expect(load({ ...VALID, ...override }, production).keys).toBeNull();
    }
  });

  it("geliştirmede tanımlanmayan anahtarları türetir; kimlikler önceki sürümle aynı kalır", () => {
    const defaults = createAppKeys(mustLoad({}, false));
    expect(defaults.openId("randevu", "kullanici-1")).toBe(
      legacySign(DEV_APP_SECRET, "openid", "randevu:kullanici-1"),
    );

    const custom = createAppKeys(mustLoad({ VADO_APP_SECRET: APP_SECRET }, false));
    expect(custom.openId("randevu", "kullanici-1")).toBe(
      legacySign(APP_SECRET, "openid", "randevu:kullanici-1"),
    );
  });

  it("geliştirmede tanımlanan aile ortamdan okunur, diğerleri türetilir", () => {
    const { keys } = load({ VADO_QR_KEYS: VALID.VADO_QR_KEYS }, false);
    expect(keys?.qr.map((item) => item.id)).toEqual(["k1"]);
    expect(keys?.otp.map((item) => item.id)).toEqual(["dev"]);
  });

  it("süresi dolmuş doğrulama anahtarı başlangıcı engellemez", () => {
    const { problems } = load({
      ...VALID,
      VADO_QR_KEYS: `k2:${hex("yeni")},k1:${hex("qr")}:2020-01-01`,
    });
    expect(problems).toEqual([]);
  });

  it("sorun bildirirken anahtarları yazmaz", () => {
    const { problems } = load({
      VADO_OTP_KEYS: `k1:${hex("ortak")}`,
      VADO_QR_KEYS: `k1:${hex("ortak")}`,
      VADO_OPENID_KEY: hex("kimlik"),
      VADO_APP_SECRET: APP_SECRET,
    });
    const messages = problems.join("\n");
    expect(problems.length).toBeGreaterThan(1);
    for (const secret of [hex("ortak"), hex("kimlik"), APP_SECRET]) {
      expect(messages).not.toContain(secret);
    }
  });
});

describe("eski ana anahtardan geçiş", () => {
  const migrated = () => migrateKeys(APP_SECRET, "2026-10-05");

  it("geçiş çıktısı canlı ortamda kabul edilir; eski anahtar dursa da kaldırılsa da", () => {
    const env = toKeyEnv(migrated());
    expect(load({ ...env, VADO_APP_SECRET: APP_SECRET }).problems).toEqual([]);
    expect(load(env).problems).toEqual([]);
  });

  it("mini uygulama kimlikleri değişmez", () => {
    const keys = createAppKeys(migrated());
    expect(keys.openId("randevu", "kullanici-1")).toBe(
      legacySign(APP_SECRET, "openid", "randevu:kullanici-1"),
    );
  });

  it("eski QR imzaları geçerli kalır, yeni imzalar yeni anahtarla atılır", () => {
    const config = migrated();
    const keys = createAppKeys(config);
    const legacy = legacySign(APP_SECRET, "qr", "veri");

    expect(keys.qr.verify("veri", legacy)).toEqual({ keyId: "legacy", current: false });
    expect(config.qr.map((item) => [item.id, item.validThrough])).toEqual([
      ["k1", null],
      ["legacy", null],
    ]);
    const fresh = keys.qr.sign("veri");
    expect(fresh.startsWith("k1.")).toBe(true);
    expect(fresh).not.toContain(legacy);
    expect(keys.qr.verify("veri", fresh)).toEqual({ keyId: "k1", current: true });
  });

  it("yoldaki doğrulama kodları geçiş gününün sonuna kadar geçer, sonra geçmez", () => {
    const { otp } = migrated();
    const text = "login:+905550000001:482915";
    const legacy = legacySign(APP_SECRET, "otp", text);

    expect(createKeyring(otp, at("2026-10-05T23:59:59Z")).verify(text, legacy)).not.toBeNull();
    expect(createKeyring(otp, at("2026-10-06T00:00:00Z")).verify(text, legacy)).toBeNull();
  });

  it("yeni aileler birbirinden ve eski ana anahtardan bağımsızdır", () => {
    const config = migrated();
    const keys = createAppKeys(config);
    expect(keys.otp.verify("veri", keys.qr.sign("veri"))).toBeNull();
    expect(keys.qr.verify("veri", keys.otp.sign("veri"))).toBeNull();
    // Yeni imza anahtarları rastgeledir; eski ana anahtarı bilen biri onları türetemez.
    const signing = (ring: KeyEntry[]) => ring[0]?.key.toString("hex");
    const again = migrated();
    expect(signing(config.qr)).not.toBe(signing(again.qr));
    expect(signing(config.otp)).not.toBe(signing(again.otp));
    expect(signing(config.qr)).not.toBe(legacyKey(APP_SECRET, "qr").toString("hex"));
    expect(signing(config.otp)).not.toBe(legacyKey(APP_SECRET, "otp").toString("hex"));
  });

  it("eski anahtar tanımlıyken sıfırdan üretilmiş anahtarlarla başlamaz", () => {
    const fresh = toKeyEnv(generateKeys());
    const { keys, problems } = load({ ...fresh, VADO_APP_SECRET: APP_SECRET });
    expect(keys).toBeNull();
    expect(problems).toHaveLength(2);
    expect(problems[0]).toContain("VADO_OPENID_KEY");
    expect(problems[1]).toContain("VADO_QR_KEYS");
    // Eski anahtarı kaldırmak bilinçli bir seçimdir; o zaman yeni anahtarlar kabul edilir.
    expect(load(fresh).problems).toEqual([]);
  });

  it("eski anahtar tanımlıyken legacy QR anahtarı çıkarılmışsa başlamaz", () => {
    const config = migrated();
    const env = toKeyEnv({ ...config, qr: config.qr.slice(0, 1) });
    const { keys, problems } = load({ ...env, VADO_APP_SECRET: APP_SECRET });
    expect(keys).toBeNull();
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("basılmış QR kodları geçersiz olur");
  });

  it("geçiş denetimi yalnızca canlı ortamda uygulanır", () => {
    const fresh = toKeyEnv(generateKeys());
    expect(load({ ...fresh, VADO_APP_SECRET: APP_SECRET }, false).problems).toEqual([]);
  });
});

describe("anahtar üretme ve döndürme", () => {
  it("üretilen anahtarlar canlı ortamda kabul edilir ve birbirinden farklıdır", () => {
    const config = generateKeys();
    expect(load(toKeyEnv(config)).problems).toEqual([]);
    const all = [...config.otp, ...config.qr].map((item) => item.key.toString("hex"));
    expect(new Set([...all, config.openId.toString("hex")]).size).toBe(3);
  });

  it("döndürme başa yeni bir imza anahtarı ekler; eskisi doğrulamayı sürdürür", () => {
    const before = [entry("k1", "eski")];
    const after = rotateKeyring(before, null, NOW);
    expect(after.map((item) => [item.id, item.validThrough])).toEqual([
      ["k2", null],
      ["k1", null],
    ]);

    const signature = createKeyring(before).sign("veri");
    const ring = createKeyring(after);
    expect(ring.verify("veri", signature)).toEqual({ keyId: "k1", current: false });
    expect(ring.sign("veri").startsWith("k2.")).toBe(true);
    // Girdi halkası değişmez.
    expect(before).toEqual([entry("k1", "eski")]);
  });

  it("eski anahtara verilen son geçerlilik günü ortam değişkenine yazılır", () => {
    const after = rotateKeyring([entry("k1", "eski")], "2027-01-31", NOW);
    expect(formatKeyring(after).endsWith(`,k1:${hex("eski")}:2027-01-31`)).toBe(true);
    expect(parseKeyring(formatKeyring(after)).problems).toEqual([]);
  });

  it("süresi dolmuş anahtarları halkadan atar, dolmamışları korur", () => {
    const before = [
      entry("k3", "c"),
      entry("k2", "b", "2026-10-03"),
      entry("k1", "a", "2026-10-04"),
      entry(LEGACY_KEY_ID, "l"),
    ];
    const after = rotateKeyring(before, "2026-12-31", NOW);
    expect(after.map((item) => [item.id, item.validThrough])).toEqual([
      ["k4", null],
      ["k3", "2026-12-31"],
      ["k1", "2026-10-04"],
      ["legacy", null],
    ]);
  });

  it.each<[string, string[], string]>([
    ["ilk döndürme", ["k1"], "k2"],
    ["aradaki kimlikler silinmiş", ["k7", "legacy"], "k8"],
    ["elle verilmiş kimlikler", ["2026a", "yedek"], "k1"],
    ["sıra karışık", ["k2", "k10", "k3"], "k11"],
  ])("yeni anahtara kullanılmamış bir kimlik verir: %s", (_label, ids, expected) => {
    const before = ids.map((id) => entry(id, id));
    expect(rotateKeyring(before, null, NOW)[0]?.id).toBe(expected);
  });

  it("halkanın durumunu anahtarları göstermeden özetler", () => {
    const entries = [
      entry("k3", "c"),
      entry("k2", "b", "2026-10-03"),
      entry("k1", "a", "2026-10-04"),
    ];
    const summary = describeKeyring(entries, NOW);
    expect(summary).toEqual([
      { id: "k3", role: "signs", validThrough: null, expired: false },
      { id: "k2", role: "verifies", validThrough: "2026-10-03", expired: true },
      { id: "k1", role: "verifies", validThrough: "2026-10-04", expired: false },
    ]);
    expect(JSON.stringify(summary)).not.toContain(hex("c"));
  });
});

describe("keys komutu", () => {
  const run = (args: string[], env: KeyEnv = {}) => runKeyCommand(args, () => env, NOW);
  /** Komut çıktısındaki değişken satırlarını okur; açıklama satırlarını atlar. */
  const variables = (lines: string[]): KeyEnv =>
    Object.fromEntries(
      lines
        .filter((line) => !line.startsWith("#"))
        .map((line): [string, string] => {
          const [name = "", value = ""] = line.split("=", 2);
          return [name, value];
        }),
    );

  it("generate: canlı ortamın kabul ettiği üç değişkeni .env satırları olarak üretir", () => {
    const lines = run(["generate"]);
    for (const line of lines) expect(line).toMatch(/^(# .+|VADO_[A-Z_]+=[0-9a-z:,-]+)$/);
    const env = variables(lines);
    expect(Object.keys(env).sort()).toEqual(["VADO_OPENID_KEY", "VADO_OTP_KEYS", "VADO_QR_KEYS"]);
    expect(load(env).problems).toEqual([]);
  });

  it("generate: tanımlı anahtarların yerine yenisini üretmez", () => {
    expect(() => run(["generate"], { VADO_QR_KEYS: VALID.VADO_QR_KEYS })).toThrow("zaten tanımlı");
    expect(() => run(["generate"], { VADO_APP_SECRET: APP_SECRET })).toThrow("keys migrate");
  });

  it("migrate: kimlikleri ve eski QR kodlarını koruyan değişkenleri üretir", () => {
    const env = variables(run(["migrate"], { VADO_APP_SECRET: APP_SECRET }));
    const keys = mustLoad({ ...env, VADO_APP_SECRET: APP_SECRET });

    const signer = createAppKeys(keys);
    expect(signer.openId("randevu", "u1")).toBe(legacySign(APP_SECRET, "openid", "randevu:u1"));
    expect(signer.qr.verify("veri", legacySign(APP_SECRET, "qr", "veri"))?.keyId).toBe("legacy");
    // Yoldaki doğrulama kodları için eski anahtar ertesi günün sonuna kadar kalır.
    expect(keys.otp.map((item) => [item.id, item.validThrough])).toEqual([
      ["k1", null],
      ["legacy", "2026-10-05"],
    ]);
  });

  it("migrate: eski anahtar yoksa, geliştirme anahtarıysa ya da geçiş yapılmışsa çalışmaz", () => {
    expect(() => run(["migrate"])).toThrow("VADO_APP_SECRET tanımlı değil");
    expect(() => run(["migrate"], { VADO_APP_SECRET: DEV_APP_SECRET })).toThrow(
      "geliştirme anahtarı",
    );
    expect(() => run(["migrate"], { ...VALID, VADO_APP_SECRET: APP_SECRET })).toThrow(
      "geçiş bir kez yapılır",
    );
  });

  it("rotate qr: eski anahtar süresiz kalır; --until ile süre verilir", () => {
    const env = { VADO_QR_KEYS: `k1:${hex("qr")},legacy:${hex("eski")}` };

    const open = parseKeyring(variables(run(["rotate", "qr"], env)).VADO_QR_KEYS ?? "");
    expect(open.entries.map((item) => [item.id, item.validThrough])).toEqual([
      ["k2", null],
      ["k1", null],
      ["legacy", null],
    ]);

    const lines = run(["rotate", "qr", "--until", "2027-03-31"], env);
    const dated = parseKeyring(variables(lines).VADO_QR_KEYS ?? "");
    expect(dated.entries[1]).toMatchObject({ id: "k1", validThrough: "2027-03-31" });
    expect(dated.entries[1]?.key.toString("hex")).toBe(hex("qr"));
    expect(lines).toContain('# "k1": 2027-03-31 gününün sonuna kadar (UTC) doğrular');
  });

  it("rotate otp: eski anahtar ertesi günün sonuna kadar kalır", () => {
    const env = variables(run(["rotate", "otp"], { VADO_OTP_KEYS: VALID.VADO_OTP_KEYS }));
    const ring = parseKeyring(env.VADO_OTP_KEYS ?? "");
    expect(ring.entries.map((item) => [item.id, item.validThrough])).toEqual([
      ["k2", null],
      ["k1", "2026-10-05"],
    ]);
  });

  it("rotate --drop-old: yalnızca yeni anahtar kalır ve sonucu açıkça yazılır", () => {
    const lines = run(["rotate", "qr", "--drop-old"], {
      VADO_QR_KEYS: `k1:${hex("qr")},legacy:${hex("eski")}`,
    });
    const ring = parseKeyring(variables(lines).VADO_QR_KEYS ?? "");
    expect(ring.entries.map((item) => item.id)).toEqual(["k2"]);
    expect(lines).toContain("# Halkadan çıkarıldı: k1, legacy");
    expect(lines.join("\n")).toContain("tüm QR kodları geçersiz olur");
  });

  it.each<[string, string[], KeyEnv, string]>([
    ["geçmiş gün", ["rotate", "qr", "--until", "2026-10-03"], VALID, "--until"],
    ["bozuk tarih", ["rotate", "qr", "--until", "31.12.2026"], VALID, "--until"],
    [
      "çelişen seçenekler",
      ["rotate", "qr", "--until", "2027-01-01", "--drop-old"],
      VALID,
      "birlikte",
    ],
    ["tanımsız halka", ["rotate", "qr"], {}, "VADO_QR_KEYS tanımlı değil"],
    ["bozuk halka", ["rotate", "otp"], { VADO_OTP_KEYS: "k1:abc" }, "VADO_OTP_KEYS geçersiz"],
    ["bilinmeyen aile", ["rotate", "sms"], VALID, "Kullanım:"],
    ["aile verilmemiş", ["rotate"], VALID, "Kullanım:"],
    ["bilinmeyen komut", ["sil"], VALID, "Kullanım:"],
    ["bilinmeyen seçenek", ["check", "--zorla"], VALID, "Kullanım:"],
    ["komuta ait olmayan seçenek", ["check", "--drop-old"], VALID, "Kullanım:"],
    ["komut verilmemiş", [], VALID, "Kullanım:"],
  ])("geçersiz kullanımı reddeder: %s", (_label, args, env, message) => {
    expect(() => run(args, env)).toThrow(message);
  });

  it("check: halkaları anahtarları göstermeden özetler", () => {
    const env = { ...toKeyEnv(migrateKeys(APP_SECRET, "2026-10-05")), VADO_APP_SECRET: APP_SECRET };
    const output = run(["check"], env).join("\n");
    expect(output).toContain("k1      imzalar");
    expect(output).toContain("legacy  2026-10-05 gününün sonuna kadar (UTC) doğrular");
    expect(output).toContain("legacy  halkadan çıkarılana kadar doğrular");
    expect(output).toContain("mini uygulama kimlikleri ve daha önce üretilmiş");
    expect(output).toContain("Anahtarlar canlı ortam için geçerli.");
    expect(output).not.toMatch(/[0-9a-f]{32}/);
    expect(output).not.toContain(APP_SECRET);
  });

  it("check: süresi dolmuş anahtarın halkadan çıkarılabileceğini söyler", () => {
    const expired = `k2:${hex("yeni")},k1:${hex("qr")}:2026-10-03`;
    const output = run(["check"], { ...VALID, VADO_QR_KEYS: expired }).join("\n");
    expect(output).toContain("k1  süresi 2026-10-03 günü doldu; halkadan çıkarılabilir");
  });

  it("check: canlı ortamın reddedeceği anahtarları sorunlarıyla bildirir", () => {
    expect(() => run(["check"], {})).toThrow("tanımlı değil");
    const fresh = toKeyEnv(generateKeys());
    expect(() => run(["check"], { ...fresh, VADO_APP_SECRET: APP_SECRET })).toThrow(
      "kullanıcı kimlikleri değişir",
    );
  });

  it("değişkenlerin okunacağı dosyayı --from ile alır", () => {
    const requested: (string | undefined)[] = [];
    const readEnv = (file: string | undefined): KeyEnv => {
      requested.push(file);
      return VALID;
    };
    runKeyCommand(["check"], readEnv, NOW);
    runKeyCommand(["check", "--from", "infra/.env.production"], readEnv, NOW);
    expect(requested).toEqual([undefined, "infra/.env.production"]);
  });
});

describe("keys komutu süreç olarak", () => {
  let directory: string | undefined;
  afterEach(async () => {
    if (directory !== undefined) await rm(directory, { recursive: true, force: true });
  });

  /** Komutu, `npm run keys` gibi paket klasöründen ama başka bir klasörde yazılmışçasına çalıştırır. */
  function runProcess(args: string[], initCwd: string, input?: string) {
    const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli/keys.ts", ...args], {
      encoding: "utf8",
      env: { ...process.env, INIT_CWD: initCwd },
      ...(input === undefined ? {} : { input }),
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  it("eski kurulumun dosyasından geçiş satırlarını üretir ve dosyayı denetler", async () => {
    directory = await mkdtemp(join(tmpdir(), "vado-keys-"));
    const file = join(directory, "canli.env");
    await writeFile(
      file,
      `# Canlı ortam\nPOSTGRES_PASSWORD=sifre\nVADO_APP_SECRET=${APP_SECRET}\n`,
    );

    // Dosya yolu, komutun yazıldığı klasöre göre çözülür.
    const migrated = runProcess(["migrate", "--from", "canli.env"], directory);
    expect(migrated).toMatchObject({ status: 0, stderr: "" });
    expect(migrated.stdout).toContain("VADO_OPENID_KEY=");

    const before = runProcess(["check", "--from", "canli.env"], directory);
    expect(before.status).toBe(1);
    expect(before.stdout).toBe("");
    expect(before.stderr).toContain("tanımlı değil");

    await writeFile(file, `VADO_APP_SECRET=${APP_SECRET}\n${migrated.stdout}`);
    const after = runProcess(["check", "--from", "canli.env"], directory);
    expect(after).toMatchObject({ status: 0, stderr: "" });
    expect(after.stdout).toContain("Anahtarlar canlı ortam için geçerli.");

    const missing = runProcess(["check", "--from", "yok.env"], directory);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain("Dosya okunamadı");
  });

  it("dosyayı standart girdiden de okur", async () => {
    directory = await mkdtemp(join(tmpdir(), "vado-keys-"));
    // Tırnak içindeki değer, Compose'un okuduğu gibi tırnaksız okunmalıdır.
    const migrated = runProcess(
      ["migrate", "--from", "-"],
      directory,
      `VADO_APP_SECRET="${APP_SECRET}"\n`,
    );
    expect(migrated).toMatchObject({ status: 0, stderr: "" });
    const openId = /^VADO_OPENID_KEY=(.+)$/m.exec(migrated.stdout)?.[1];
    expect(openId).toBe(legacyKey(APP_SECRET, "openid").toString("hex"));
  });
});

describe("anahtar değişikliğinde çalışan sistem", () => {
  const apps: TestApp[] = [];
  /** Aynı veritabanına bağlı, verilen anahtarlarla çalışan bir API süreci başlatır. */
  async function start(keys: KeyConfig): Promise<TestApp> {
    const app = await startTestApp(toKeyEnv(keys));
    apps.push(app);
    return app;
  }
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.stop()));
  });

  const device = { deviceName: "Test Telefonu", platform: "android", deviceId: "anahtar-testi-01" };
  const yesterday = utcDay(Date.now() - DAY_MS);
  const tomorrow = utcDay(Date.now() + DAY_MS);

  /** Doğrulanmış, yayında ve kimlik yetkisi olan bir mini uygulama kaydeder. */
  async function publishMiniApp(app: TestApp): Promise<string> {
    const id = `anahtar-${randomUUID().slice(0, 8)}`;
    const admin = asAdmin(app);
    await admin.ok(adminMiniAppSchema, "PUT", `/v1/admin/miniapps/${id}`, {
      body: {
        name: "Anahtar Testi",
        description: "Anahtar değişikliklerinin sınandığı örnek mini uygulama",
        category: "beauty",
        developerName: "VADO",
        development: {
          entryUrl: "https://anahtar.example.com/",
          allowedOrigins: ["https://anahtar.example.com"],
          capabilities: ["identity.basic"],
          version: "1.0.0",
        },
      },
    });
    await admin.done("PATCH", `/v1/admin/miniapps/${id}`, { body: { verified: true } });
    return id;
  }

  const resolveQr = (app: TestApp, user: TestUser, value: string) =>
    as(app, user).request("POST", "/v1/qr/resolve", { body: { value } });
  const oldKeyLogs = (app: TestApp) =>
    app.logs.filter((log) => log.message === "Eski anahtarla imzalı QR kod doğrulandı");

  it("2.1'den geçen kurulumda eski QR kodu açılır, kimlik aynı kalır, yoldaki kod geçer", async () => {
    const app = await start(migrateKeys(APP_SECRET, tomorrow));
    const user = await createUser(app, "Ayşe");
    const client = as(app, user);
    const miniAppId = await publishMiniApp(app);

    // 2.1'in ürettiği, anahtar kimliği taşımayan süresiz kod (örneğin basılmış bir kod).
    const data = Buffer.from(JSON.stringify({ t: "miniapp", id: miniAppId, exp: null })).toString(
      "base64url",
    );
    const printed = `${QR_PREFIX}${data}.${legacySign(APP_SECRET, "qr", data)}`;
    const target = await client.ok(qrTargetSchema, "POST", "/v1/qr/resolve", {
      body: { value: printed },
    });
    expect(target).toMatchObject({ type: "miniapp", miniApp: { id: miniAppId } });
    expect(oldKeyLogs(app)).toEqual([
      {
        level: "info",
        fields: { keyId: "legacy", type: "miniapp" },
        message: "Eski anahtarla imzalı QR kod doğrulandı",
      },
    ]);

    // Yeni kodlar yeni anahtarla imzalanır ve günlüğe eski anahtar kaydı düşmez.
    const issued = await client.ok(issuedQrSchema, "POST", "/v1/qr", {
      body: { type: "miniapp", id: miniAppId },
    });
    expect(issued.value.startsWith(`${QR_PREFIX}${data}.k1.`)).toBe(true);
    await client.ok(qrTargetSchema, "POST", "/v1/qr/resolve", { body: { value: issued.value } });
    expect(oldKeyLogs(app)).toHaveLength(1);

    // Mini uygulamanın tanıdığı kimlik, 2.1'in verdiği kimliğin aynısıdır.
    const identity = await client.ok(
      miniAppIdentitySchema,
      "GET",
      `/v1/miniapps/${miniAppId}/identity`,
    );
    expect(identity.openId).toBe(legacySign(APP_SECRET, "openid", `${miniAppId}:${user.id}`));

    // Geçişten hemen önce 2.1'in gönderdiği kod: özeti anahtar kimliği taşımaz.
    const phone = randomPhone();
    await app.db.execute(sql`
      insert into otp_challenges (phone, purpose, code_hash, request_ip, expires_at)
      values (
        ${phone},
        'login',
        ${legacySign(APP_SECRET, "otp", `login:${phone}:482915`)},
        '10.0.0.1',
        now() + interval '5 minutes'
      )
    `);
    const guest = anonymous(app);
    await guest.fail("otp_invalid", "POST", "/v1/auth/otp/verify", {
      body: { phone, code: "482916", acceptedTermsVersion: TERMS_VERSION, ...device },
    });
    const signedIn = await guest.ok(authResultSchema, "POST", "/v1/auth/otp/verify", {
      body: { phone, code: "482915", acceptedTermsVersion: TERMS_VERSION, ...device },
    });
    expect(signedIn.user.phone).toBe(phone);
  });

  it("QR anahtarı değişince eski kodlar belirlenen süre boyunca açılır, kimlikler değişmez", async () => {
    const base = generateKeys();
    const [k1] = base.qr;
    if (k1 === undefined) throw new Error("QR halkası boş");
    const rotated = rotateKeyring(base.qr, null, Date.now());
    const [k2] = rotated;
    if (k2 === undefined) throw new Error("QR halkası boş");

    const before = await start(base);
    const user = await createUser(before, "Mehmet");
    const miniAppId = await publishMiniApp(before);
    const printed = await as(before, user).ok(issuedQrSchema, "POST", "/v1/qr", {
      body: { type: "miniapp", id: miniAppId },
    });
    expect(printed.value).toContain(".k1.");
    const identityUrl = `/v1/miniapps/${miniAppId}/identity`;
    const identity = await as(before, user).ok(miniAppIdentitySchema, "GET", identityUrl);

    // Yeni anahtar imzalar; eski anahtar halkada kaldığı sürece eski kod açılır.
    const after = await start({ ...base, qr: rotated });
    expect(await resolveQr(after, user, printed.value)).toMatchObject({ status: 200 });
    expect(oldKeyLogs(after).map((log) => log.fields)).toEqual([{ keyId: "k1", type: "miniapp" }]);
    const reissued = await as(after, user).ok(issuedQrSchema, "POST", "/v1/qr", {
      body: { type: "miniapp", id: miniAppId },
    });
    expect(reissued.value).toContain(".k2.");
    expect(await resolveQr(after, user, reissued.value)).toMatchObject({ status: 200 });
    // Yeni kodu, yeni anahtarı henüz almamış süreç tanımaz.
    expect(await resolveQr(before, user, reissued.value)).toMatchObject({
      status: 400,
      body: { error: { code: "qr_invalid" } },
    });

    // Belirlenen süre dolunca ya da anahtar halkadan çıkarılınca eski kod geçersizdir.
    const expired = await start({ ...base, qr: [k2, { ...k1, validThrough: yesterday }] });
    const removed = await start({ ...base, qr: [k2] });
    for (const app of [expired, removed]) {
      expect(await resolveQr(app, user, printed.value)).toMatchObject({
        status: 400,
        body: { error: { code: "qr_invalid" } },
      });
      expect(await resolveQr(app, user, reissued.value)).toMatchObject({ status: 200 });
    }

    // QR anahtarı kaç kez değişirse değişsin mini uygulamanın gördüğü kimlik aynıdır.
    for (const app of [after, expired, removed]) {
      const current = await as(app, user).ok(miniAppIdentitySchema, "GET", identityUrl);
      expect(current.openId).toBe(identity.openId);
    }
  });

  it("doğrulama kodu anahtarı diğerlerinden bağımsız değişir", async () => {
    const base = generateKeys();
    const rotated = rotateKeyring(base.otp, tomorrow, Date.now());
    const [k2] = rotated;
    if (k2 === undefined) throw new Error("OTP halkası boş");

    const before = await start(base);
    const user = await createUser(before, "Zeynep");
    const miniAppId = await publishMiniApp(before);
    const qr = await as(before, user).ok(issuedQrSchema, "POST", "/v1/qr", {
      body: { type: "miniapp", id: miniAppId },
    });
    const identityUrl = `/v1/miniapps/${miniAppId}/identity`;
    const identity = await as(before, user).ok(miniAppIdentitySchema, "GET", identityUrl);

    const requestCode = async (app: TestApp) => {
      const phone = randomPhone();
      await anonymous(app).ok(requestOtpResponseSchema, "POST", "/v1/auth/otp", {
        body: { phone },
      });
      const stored = await app.db.one<{ code_hash: string }>(sql`
        select code_hash from otp_challenges where phone = ${phone}
      `);
      return { phone, keyId: stored.code_hash.split(".")[0] };
    };
    const verification = (phone: string) => ({
      body: { phone, code: "000000", acceptedTermsVersion: TERMS_VERSION, ...device },
    });

    // Anahtar değişirken yolda olan kod, eski anahtar halkada kaldığı sürece geçer.
    const inFlight = await requestCode(before);
    expect(inFlight.keyId).toBe("k1");
    const after = await start({ ...base, otp: rotated });
    await anonymous(after).ok(
      authResultSchema,
      "POST",
      "/v1/auth/otp/verify",
      verification(inFlight.phone),
    );
    expect((await requestCode(after)).keyId).toBe("k2");

    // Eski anahtar hemen çıkarılırsa yoldaki kod geçmez; yeni istenen kod yeni anahtarla geçer.
    const dropped = await requestCode(before);
    const removed = await start({ ...base, otp: [k2] });
    await anonymous(removed).fail(
      "otp_invalid",
      "POST",
      "/v1/auth/otp/verify",
      verification(dropped.phone),
    );
    const renewed = await requestCode(removed);
    await anonymous(removed).ok(
      authResultSchema,
      "POST",
      "/v1/auth/otp/verify",
      verification(renewed.phone),
    );

    // Doğrulama kodu anahtarının değişmesi QR kodlarını ve mini uygulama kimliklerini etkilemez.
    for (const app of [after, removed]) {
      expect(await resolveQr(app, user, qr.value)).toMatchObject({ status: 200 });
      expect(oldKeyLogs(app)).toEqual([]);
      const current = await as(app, user).ok(miniAppIdentitySchema, "GET", identityUrl);
      expect(current.openId).toBe(identity.openId);
    }
  });
});
