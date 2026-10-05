import { type NextRequest, NextResponse } from "next/server";

import { isAuthorized, portalAccess } from "./lib/credentials";

const HEALTH_PATH = "/healthz";

/**
 * Panelin tamamı (sayfalar, sunucu işlevleri, statik dosyalar) HTTP Basic girişinin arkasındadır.
 * Yetki, sunucu işlevlerinde ayrıca doğrulanır (bkz. lib/operator.ts); burası tarayıcıya giriş
 * penceresini açtıran ilk katmandır.
 */
export function proxy(request: NextRequest): NextResponse {
  // Sağlık denetimi (Docker, yük dengeleyici) giriş bilgisi taşımaz.
  if (request.nextUrl.pathname === HEALTH_PATH) return NextResponse.next();

  const access = portalAccess();
  if (access.kind === "open") return NextResponse.next();
  if (access.kind === "unconfigured") {
    return new NextResponse(
      "Panel girişi yapılandırılmamış. VADO_PORTAL_USER ve VADO_PORTAL_PASSWORD tanımlanmalı.",
      { status: 503 },
    );
  }
  if (isAuthorized(request.headers.get("authorization"), access)) return NextResponse.next();

  return new NextResponse("Bu sayfa için giriş yapmalısın.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="VADO Control", charset="UTF-8"' },
  });
}
