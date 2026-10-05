import { type NextRequest, NextResponse } from "next/server";

import { env, isProduction } from "./lib/env";
import { SESSION_COOKIE } from "./lib/session";

const HEALTH_PATH = "/healthz";
const LOGIN_PATH = "/login";

/**
 * Oturum çerezi olmayan isteği giriş sayfasına gönderir. Bu yalnızca yönlendirmedir: çerezdeki
 * oturumun geçerliliğine ve hesabın yetkisine API, panelin yaptığı her çağrıda ayrıca bakar.
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  // Sağlık denetimi (Docker, yük dengeleyici) oturum taşımaz.
  if (pathname === HEALTH_PATH) return NextResponse.next();

  // 2.3'ün paylaşılan panel girişi kalktı. Değişkenler hâlâ tanımlıysa yükseltme yarım kalmıştır;
  // canlı panel, yöneticinin bunu fark etmesi için açılmaz.
  if (isProduction && (env("VADO_PORTAL_USER") ?? env("VADO_PORTAL_PASSWORD")) !== undefined) {
    return new NextResponse(
      "Panelin ortak kullanıcı adı ve şifresi 2.4'te kaldırıldı; her yönetici kendi hesabıyla " +
        "girer. VADO_PORTAL_USER ve VADO_PORTAL_PASSWORD değişkenlerini kaldırın (bkz. docs/YAYIN.md).",
      { status: 503 },
    );
  }

  if (pathname === LOGIN_PATH || pathname.startsWith(`${LOGIN_PATH}/`)) return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
}

export const config = {
  // Next.js'in kendi dosyaları ve panelin simgesi oturumsuz sunulur.
  matcher: ["/((?!_next/|icon.png).*)"],
};
