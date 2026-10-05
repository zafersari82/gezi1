import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

/** İki metni, uzunlukları dışında bilgi sızdırmadan karşılaştırır. */
export function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Oturum belirteci gibi tahmin edilemez değerler için 256 bitlik rastgele metin üretir. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Metnin ya da ham verinin SHA-256 özeti (onaltılık). */
export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Sayfaya gömülen betiğin ya da stilin güvenlik politikasındaki (CSP) karşılığı: tarayıcı yalnızca
 * içeriği bu özetle eşleşen satır içi kodu çalıştırır.
 */
export function cspHash(inline: string): string {
  return `'sha256-${createHash("sha256").update(inline).digest("base64")}'`;
}

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Parola özetinin parametreleri. N = 2^15 ile bir özet yaklaşık 32 MB bellek ister: tahmin
 * denemelerini ekran kartında ve özel donanımda pahalı kılan budur.
 */
const SCRYPT_COST_LOG2 = 15;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELISM = 1;
const SCRYPT_KEY_BYTES = 32;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_PREFIX = "scrypt";

function scryptOptions(costLog2: number, blockSize: number, parallelism: number) {
  const N = 2 ** costLog2;
  return { N, r: blockSize, p: parallelism, maxmem: 256 * N * blockSize };
}

/**
 * Parolayı scrypt ile özetler. Sonuç parametreleri ve tuzu da taşır
 * (`scrypt$15$8$1$<tuz>$<özet>`); parametreler ileride değişse de eski özetler doğrulanır.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const key = await scryptAsync(
    password,
    salt,
    SCRYPT_KEY_BYTES,
    scryptOptions(SCRYPT_COST_LOG2, SCRYPT_BLOCK_SIZE, SCRYPT_PARALLELISM),
  );
  return [
    SCRYPT_PREFIX,
    SCRYPT_COST_LOG2,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELISM,
    salt.toString("base64url"),
    key.toString("base64url"),
  ].join("$");
}

/** Parolayı özetle sabit zamanda karşılaştırır. Biçimi bozuk özet hiçbir parolayla eşleşmez. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [prefix, costLog2, blockSize, parallelism, salt, key] = stored.split("$");
  if (
    prefix !== SCRYPT_PREFIX ||
    costLog2 === undefined ||
    blockSize === undefined ||
    parallelism === undefined ||
    salt === undefined ||
    key === undefined
  ) {
    return false;
  }
  const expected = Buffer.from(key, "base64url");
  const actual = await scryptAsync(
    password,
    Buffer.from(salt, "base64url"),
    expected.length,
    scryptOptions(Number(costLog2), Number(blockSize), Number(parallelism)),
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
