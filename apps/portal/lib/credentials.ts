import { createHash, timingSafeEqual } from "node:crypto";

import { env, isProduction } from "./env";

/**
 * Panele kimlerin girebileceği. Canlı ortamda kullanıcı adı ve şifre tanımlı değilse panel hiç
 * açılmaz; geliştirmede tanımlı değilse şifresiz açılır.
 */
export type PortalAccess =
  { kind: "basic"; user: string; password: string } | { kind: "open" } | { kind: "unconfigured" };

export type BasicAccess = Extract<PortalAccess, { kind: "basic" }>;

export function portalAccess(): PortalAccess {
  const user = env("VADO_PORTAL_USER");
  const password = env("VADO_PORTAL_PASSWORD");
  if (user !== undefined && password !== undefined) return { kind: "basic", user, password };
  return isProduction ? { kind: "unconfigured" } : { kind: "open" };
}

/** Özetleri karşılaştırır; böylece süre, değerlerin uzunluğunu ve içeriğini ele vermez. */
function safeEqual(left: string, right: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(left), digest(right));
}

/** `Authorization: Basic …` başlığındaki kullanıcı adı ve şifre doğru mu? */
export function isAuthorized(header: string | null, access: BasicAccess): boolean {
  if (header?.startsWith("Basic ") !== true) return false;
  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator === -1) return false;

  // İki alan da her zaman karşılaştırılır; hangisinin yanlış olduğu yanıt süresinden anlaşılmaz.
  const userMatches = safeEqual(decoded.slice(0, separator), access.user);
  const passwordMatches = safeEqual(decoded.slice(separator + 1), access.password);
  return userMatches && passwordMatches;
}
