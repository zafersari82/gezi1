import "server-only";

import { headers } from "next/headers";

import { isAuthorized, portalAccess } from "./credentials";

/**
 * İsteği yapanın panele giriş yapmış olduğunu doğrular. Sunucu işlevleri arayüz dışından,
 * doğrudan POST isteğiyle de çağrılabildiği için yetki yalnızca proxy.ts'e bırakılmaz;
 * API'ye giden her çağrıdan önce burada yeniden kontrol edilir.
 */
export async function requireOperator(): Promise<void> {
  // Başlıklar her durumda okunur: isteğe bağlı olduğu için bu işlevi çağıran sayfalar derleme
  // sırasında önceden üretilmez, her istekte yeniden çizilir.
  const requestHeaders = await headers();

  const access = portalAccess();
  if (access.kind === "open") return;
  if (access.kind === "basic" && isAuthorized(requestHeaders.get("authorization"), access)) return;
  throw new Error("Bu işlem için panele giriş yapılmış olmalı.");
}
