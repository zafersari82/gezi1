import { randomBytes } from "node:crypto";

import {
  expiryOf,
  formatKeyring,
  KEY_BYTES,
  type KeyConfig,
  type KeyEntry,
  LEGACY_KEY_ID,
  legacyKey,
} from "./keys";

/**
 * Anahtar üretme, eski sistemden geçiş ve halka döndürme. `keys` komutu bu işlevleri kullanır;
 * adımların anlatımı docs/ANAHTARLAR.md belgesindedir.
 */

const FIRST_KEY_ID = "k1";

/** Halkadaki bir anahtarın durumu. Anahtarın kendisi özete girmez. */
export interface KeyStatus {
  id: string;
  role: "signs" | "verifies";
  validThrough: string | null;
  /** Süresi dolmuş anahtar artık hiçbir imzayı doğrulamaz; halkadan çıkarılabilir. */
  expired: boolean;
}

export function generateKey(): Buffer {
  return randomBytes(KEY_BYTES);
}

/** Verilen anın gününü (UTC) `YYYY-AA-GG` biçiminde döndürür. */
export function utcDay(time: number): string {
  return new Date(time).toISOString().slice(0, 10);
}

/** Halkanın ilk, imzalayan anahtarı. */
export function firstKey(): KeyEntry {
  return { id: FIRST_KEY_ID, key: generateKey(), validThrough: null };
}

/** Yeni kurulum için bütün ailelerin anahtarlarını üretir. */
export function generateKeys(): KeyConfig {
  return { otp: [firstKey()], qr: [firstKey()], openId: generateKey(), identity: [firstKey()] };
}

/**
 * 2.1 ve öncesinin tek ana anahtarından (`VADO_APP_SECRET`) bağımsız ailelere geçişi hazırlar:
 *
 * - OpenID: eski sistemin kullandığı anahtarın kendisi. Mini uygulama kimlikleri değişmez.
 * - QR: yeni bir imza anahtarı. Eski (kimlik taşımayan) kodlar, halkadan çıkarılana kadar `legacy`
 *   anahtarıyla doğrulanır.
 * - OTP: yeni bir anahtar. Geçiş anında yolda olan kodlar `otpGraceDay` gününün sonuna kadar eski
 *   anahtarla doğrulanır; kodlar birkaç dakika yaşadığı için bu süre fazlasıyla yeter.
 * - Kimlik belirteci: yeni bir anahtar; eski sistemde bu aile yoktu.
 */
export function migrateKeys(appSecret: string, otpGraceDay: string): KeyConfig {
  const fresh = generateKeys();
  const legacy = (purpose: "otp" | "qr", validThrough: string | null): KeyEntry => ({
    id: LEGACY_KEY_ID,
    key: legacyKey(appSecret, purpose),
    validThrough,
  });
  return {
    otp: [...fresh.otp, legacy("otp", otpGraceDay)],
    qr: [...fresh.qr, legacy("qr", null)],
    openId: legacyKey(appSecret, "openid"),
    identity: fresh.identity,
  };
}

/** Halkadaki `k<sayı>` kimliklerinin bir sonrakini üretir: k1, k2, k3… */
function nextKeyId(entries: readonly KeyEntry[]): string {
  const numbers = entries.flatMap((entry) => {
    const digits = /^k(\d+)$/.exec(entry.id)?.[1];
    return digits === undefined ? [] : [Number(digits)];
  });
  return `k${Math.max(0, ...numbers) + 1}`;
}

/**
 * Halkanın başına yeni bir imzalayan anahtar ekler. O ana kadar imzalayan anahtar halkada kalır ve
 * eski imzaları doğrulamayı sürdürür: `keepPreviousThrough` verilirse o günün sonuna kadar,
 * verilmezse halkadan çıkarılana kadar. Süresi zaten dolmuş anahtarlar halkadan atılır.
 */
export function rotateKeyring(
  entries: readonly KeyEntry[],
  keepPreviousThrough: string | null,
  now: number,
): KeyEntry[] {
  const [previous, ...older] = entries;
  if (previous === undefined) throw new Error("Anahtar halkası boş olamaz");
  return [
    { id: nextKeyId(entries), key: generateKey(), validThrough: null },
    { ...previous, validThrough: keepPreviousThrough },
    ...older.filter((entry) => now < expiryOf(entry)),
  ];
}

export function describeKeyring(entries: readonly KeyEntry[], now: number): KeyStatus[] {
  return entries.map((entry, index) => ({
    id: entry.id,
    role: index === 0 ? "signs" : "verifies",
    validThrough: entry.validThrough,
    expired: !(now < expiryOf(entry)),
  }));
}

/** Anahtarları `.env` dosyasına yazılacak değişkenlere çevirir. */
export function toKeyEnv(keys: KeyConfig) {
  return {
    VADO_OTP_KEYS: formatKeyring(keys.otp),
    VADO_QR_KEYS: formatKeyring(keys.qr),
    VADO_OPENID_KEY: keys.openId.toString("hex"),
    VADO_IDENTITY_KEYS: formatKeyring(keys.identity),
  };
}
