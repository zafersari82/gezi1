import "server-only";

import { cookies } from "next/headers";

import { isProduction } from "./env";

/*
 * Panel oturumunun çerezleri. Hesabın kim olduğuna panel karar vermez: çerezdeki belirteç her
 * çağrıda API'ye taşınır, API doğrular. Çerezler tarayıcıdaki betiğe kapalıdır (`HttpOnly`),
 * canlı ortamda yalnızca HTTPS ile gönderilir (`Secure`) ve başka sitelerden gelen isteklere
 * eklenmez (`SameSite=Strict`).
 */

/** İkinci adım da geçildikten sonra açılan oturum. */
export const SESSION_COOKIE = "vado_admin_session";
/** Parolası doğrulanmış, ikinci adımı bekleyen yarım oturum. */
export const PENDING_COOKIE = "vado_admin_pending";

/** API oturumu 12 saatte kapatır; çerez de en çok o kadar yaşar. */
const SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
/** API yarım oturumu 10 dakikada kapatır. */
const PENDING_MAX_AGE_SECONDS = 10 * 60;

type CookieName = typeof SESSION_COOKIE | typeof PENDING_COOKIE;

const MAX_AGE: Record<CookieName, number> = {
  [SESSION_COOKIE]: SESSION_MAX_AGE_SECONDS,
  [PENDING_COOKIE]: PENDING_MAX_AGE_SECONDS,
};

export async function readToken(name: CookieName): Promise<string | null> {
  return (await cookies()).get(name)?.value ?? null;
}

/** Yalnızca sunucu işlevlerinde çağrılabilir: sayfa çizilirken çerez yazılamaz. */
export async function writeToken(name: CookieName, token: string): Promise<void> {
  (await cookies()).set(name, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    path: "/",
    maxAge: MAX_AGE[name],
  });
}

export async function clearToken(name: CookieName): Promise<void> {
  (await cookies()).delete(name);
}
