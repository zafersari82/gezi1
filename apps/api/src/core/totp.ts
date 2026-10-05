import { createHmac, randomBytes } from "node:crypto";

import { safeEqual } from "./security";

/*
 * Zamana dayalı tek kullanımlık kodlar (TOTP, RFC 6238) ve onların dayandığı HOTP (RFC 4226).
 * Doğrulama uygulamaları (Google Authenticator, Microsoft Authenticator, 1Password vb.) varsayılan
 * olarak SHA-1, 6 hane ve 30 saniyelik adım kullanır; panel hesapları da bunu kullanır.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
/** Saat farkı için kabul edilen komşu adım sayısı: bir önceki ve bir sonraki kod da geçer. */
const TOTP_DRIFT_STEPS = 1;
/** RFC 4226'nın önerdiği en kısa sır 128, önerilen 160 bittir. */
const TOTP_SECRET_BYTES = 20;

export type HotpAlgorithm = "sha1" | "sha256" | "sha512";

/** RFC 4648 base32, dolgu karakteri olmadan; doğrulama uygulamaları sırrı bu biçimde okur. */
export function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET.charAt((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET.charAt((value << (5 - bits)) & 31);
  return output;
}

export function base32Decode(text: string): Buffer {
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const character of text.toUpperCase().replace(/=+$/, "")) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) throw new Error("Geçersiz base32 karakteri");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** RFC 4226: sayaçtan türetilen kod. */
export function hotp(
  secret: Buffer,
  counter: number,
  digits = TOTP_DIGITS,
  algorithm: HotpAlgorithm = "sha1",
): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac(algorithm, secret).update(message).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 15;
  const binary = digest.readUInt32BE(offset) & 0x7fffffff;
  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

/** Verilen andaki (milisaniye) zaman adımı. */
export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
}

/** Yeni bir sır üretir (base32). */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(TOTP_SECRET_BYTES));
}

/**
 * Kodu doğrular ve eşleştiği zaman adımını döndürür; eşleşmezse `null`. `lastStep` ve öncesine ait
 * kodlar kabul edilmez: aynı kod ikinci kez, ya da daha yenisi kullanıldıktan sonra eskisi geçmez.
 */
export function verifyTotp(
  secret: string,
  code: string,
  nowMs: number,
  lastStep: number,
): number | null {
  const key = base32Decode(secret);
  const current = totpStep(nowMs);
  for (let step = current - TOTP_DRIFT_STEPS; step <= current + TOTP_DRIFT_STEPS; step += 1) {
    if (step > lastStep && safeEqual(hotp(key, step), code)) return step;
  }
  return null;
}

/** Doğrulama uygulamasına QR koduyla okutulan adres (`otpauth://`). */
export function totpUri(issuer: string, account: string, secret: string): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
