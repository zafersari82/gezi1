import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "../src/core/security";
import {
  base32Decode,
  base32Encode,
  hotp,
  type HotpAlgorithm,
  totpStep,
  totpUri,
  verifyTotp,
} from "../src/core/totp";

/** RFC 4226 ve RFC 6238 sınama vektörlerinin sırları (ASCII). */
const SECRET_SHA1 = Buffer.from("12345678901234567890");
const SECRET_SHA256 = Buffer.from("12345678901234567890123456789012");
const SECRET_SHA512 = Buffer.from(
  "1234567890123456789012345678901234567890123456789012345678901234",
);

describe("HOTP (RFC 4226, Ek D)", () => {
  const expected = [
    "755224",
    "287082",
    "359152",
    "969429",
    "338314",
    "254676",
    "287922",
    "162583",
    "399871",
    "520489",
  ];

  it.each(expected.map((code, counter) => [counter, code]))(
    "sayaç %i için kod %s olur",
    (counter, code) => {
      expect(hotp(SECRET_SHA1, counter)).toBe(code);
    },
  );
});

describe("TOTP (RFC 6238, Ek B)", () => {
  const vectors: [number, string, string, string][] = [
    [59, "94287082", "46119246", "90693936"],
    [1_111_111_109, "07081804", "68084774", "25091201"],
    [1_111_111_111, "14050471", "67062674", "99943326"],
    [1_234_567_890, "89005924", "91819424", "93441116"],
    [2_000_000_000, "69279037", "90698825", "38618901"],
    [20_000_000_000, "65353130", "77737706", "47863826"],
  ];
  const secrets: Record<HotpAlgorithm, Buffer> = {
    sha1: SECRET_SHA1,
    sha256: SECRET_SHA256,
    sha512: SECRET_SHA512,
  };

  it.each(vectors)(
    "%i. saniyede SHA-1, SHA-256 ve SHA-512 kodları eşleşir",
    (seconds, ...codes) => {
      const step = totpStep(seconds * 1000);
      const algorithms: HotpAlgorithm[] = ["sha1", "sha256", "sha512"];
      expect(algorithms.map((algorithm) => hotp(secrets[algorithm], step, 8, algorithm))).toEqual(
        codes,
      );
    },
  );
});

describe("TOTP doğrulama", () => {
  const secret = base32Encode(SECRET_SHA1);
  const now = 1_111_111_111_000;
  const step = totpStep(now);
  const codeAt = (offset: number) => hotp(SECRET_SHA1, step + offset);

  it("base32 RFC 4648 ile uyumludur ve geri çözülür", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(secret).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(secret)).toEqual(SECRET_SHA1);
    expect(base32Decode("mzxw6ytboi")).toEqual(Buffer.from("foobar"));
  });

  it("güncel kod ve saat farkı için bir önceki ve bir sonraki kod kabul edilir", () => {
    expect(verifyTotp(secret, codeAt(0), now, 0)).toBe(step);
    expect(verifyTotp(secret, codeAt(-1), now, 0)).toBe(step - 1);
    expect(verifyTotp(secret, codeAt(1), now, 0)).toBe(step + 1);
  });

  it("iki adımdan eski ya da ileri kod reddedilir", () => {
    expect(verifyTotp(secret, codeAt(-2), now, 0)).toBeNull();
    expect(verifyTotp(secret, codeAt(2), now, 0)).toBeNull();
    expect(verifyTotp(secret, "000000", now, 0)).toBeNull();
  });

  it("kullanılmış adımın kodu ve ondan eskisi ikinci kez kabul edilmez", () => {
    expect(verifyTotp(secret, codeAt(0), now, step)).toBeNull();
    expect(verifyTotp(secret, codeAt(-1), now, step)).toBeNull();
    expect(verifyTotp(secret, codeAt(1), now, step)).toBe(step + 1);
  });

  it("doğrulama uygulamasına okutulan adres sırrı ve ayarları taşır", () => {
    const uri = new URL(totpUri("VADO Control", "sahip", secret));
    expect(uri.protocol).toBe("otpauth:");
    expect(uri.host).toBe("totp");
    expect(decodeURIComponent(uri.pathname)).toBe("/VADO Control:sahip");
    expect(Object.fromEntries(uri.searchParams)).toEqual({
      secret,
      issuer: "VADO Control",
      algorithm: "SHA1",
      digits: "6",
      period: "30",
    });
  });
});

describe("parola özeti", () => {
  it("doğru parola eşleşir, yanlışı eşleşmez; aynı parola her seferinde farklı özetlenir", async () => {
    const first = await hashPassword("çok-gizli-bir-parola");
    const second = await hashPassword("çok-gizli-bir-parola");
    expect(first).toMatch(/^scrypt\$15\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(first).not.toBe(second);
    expect(await verifyPassword("çok-gizli-bir-parola", first)).toBe(true);
    expect(await verifyPassword("çok-gizli-bir-parolA", first)).toBe(false);
    expect(await verifyPassword("", first)).toBe(false);
  });

  it("biçimi bozuk özet hiçbir parolayla eşleşmez", async () => {
    expect(await verifyPassword("parolasiz", "parolasiz")).toBe(false);
    expect(await verifyPassword("x", "scrypt$15$8$1$")).toBe(false);
  });
});
