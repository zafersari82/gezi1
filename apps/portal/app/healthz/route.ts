/** Sağlık denetimi: panel sunucusu ayakta mı? API'ye veya veritabanına dokunmaz. */
export function GET(): Response {
  return new Response("ok", { headers: { "cache-control": "no-store" } });
}
