import { createPrivateKey, createPublicKey, type KeyObject, randomUUID, sign } from "node:crypto";

import { expiryOf, type KeyEntry } from "./keys";

/*
 * Mini uygulamanın sunucusuna verilen kimlik belirteci: Ed25519 ile imzalanmış bir JWT (RFC 7519,
 * `alg: EdDSA`, RFC 8037). Mini uygulamanın sunucusu belirteci VADO'nun yayımladığı açık
 * anahtarlarla (JWKS) doğrular; gizli anahtar yalnızca API'dedir. Anahtarlar sürümlü bir halkadır:
 * ilk anahtar imzalar, halkadaki diğerleri süreleri dolana kadar yayımlanmaya devam eder.
 */

/** Ed25519 gizli anahtarının PKCS #8 (DER) biçimi: sabit önek ve 32 baytlık tohum (RFC 8410). */
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

/** Yayımlanan açık anahtar (JWK, RFC 8037). */
export interface IdentityJwk {
  kty: "OKP";
  crv: "Ed25519";
  x: string;
  kid: string;
  use: "sig";
  alg: "EdDSA";
}

export interface IdentityClaims {
  /** Belirteci veren: API'nin dış adresi. */
  issuer: string;
  /** Belirtecin verildiği uygulama kaydı. */
  audience: string;
  /** Kullanıcının o kayda özgü takma kimliği (`openId`). */
  subject: string;
  ttlSeconds: number;
}

export interface IdentitySigner {
  /** Belirteci güncel anahtarla imzalar. */
  sign: (claims: IdentityClaims) => { token: string; expiresAt: Date };
  /** Süresi dolmamış bütün anahtarların açık anahtarları; imzalayan başta. */
  publicKeys: () => IdentityJwk[];
}

/** Ed25519 gizli anahtarını 32 baytlık tohumundan kurar. */
export function identityPrivateKey(seed: Buffer): KeyObject {
  return createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, seed.subarray(0, 32)]),
    format: "der",
    type: "pkcs8",
  });
}

const base64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

export function createIdentitySigner(
  entries: readonly KeyEntry[],
  now: () => number = Date.now,
): IdentitySigner {
  const [current] = entries;
  if (current === undefined) throw new Error("Kimlik belirteci halkası boş olamaz");
  const keys = entries.map((entry) => {
    const privateKey = identityPrivateKey(entry.key);
    const jwk = createPublicKey(privateKey).export({ format: "jwk" });
    return { entry, privateKey, x: typeof jwk.x === "string" ? jwk.x : "" };
  });
  const signing = keys[0];
  if (signing === undefined) throw new Error("Kimlik belirteci halkası boş olamaz");

  return {
    sign(claims) {
      const issuedAt = Math.floor(now() / 1000);
      const expiresAt = issuedAt + claims.ttlSeconds;
      const header = base64url({ alg: "EdDSA", typ: "JWT", kid: current.id });
      const payload = base64url({
        iss: claims.issuer,
        aud: claims.audience,
        sub: claims.subject,
        iat: issuedAt,
        exp: expiresAt,
        jti: randomUUID(),
      });
      const signature = sign(null, Buffer.from(`${header}.${payload}`), signing.privateKey);
      return {
        token: `${header}.${payload}.${signature.toString("base64url")}`,
        expiresAt: new Date(expiresAt * 1000),
      };
    },
    publicKeys() {
      return keys
        .filter(({ entry }) => now() < expiryOf(entry))
        .map(({ entry, x }) => ({
          kty: "OKP",
          crv: "Ed25519",
          x,
          kid: entry.id,
          use: "sig",
          alg: "EdDSA",
        }));
    },
  };
}
