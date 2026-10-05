import { isInScope, type MiniApp, originOf } from "@vado/contracts";

const BLANK_PAGE = "about:blank";

/**
 * Mini uygulamanın penceresinde ana sayfa olarak durabilecek adresler. Paketle yayınlanan kayıtta
 * ana sayfa yalnızca VADO'nun sarmalayıcı belgesidir; paket onun içindeki çerçevede çalışır.
 * Geliştirme adresiyle açılan kayıtta sayfa kendi adres kapsamında gezinebilir.
 */
export function mainDocumentScope(miniApp: MiniApp): readonly string[] {
  return miniApp.source === "package" ? [miniApp.entryUrl] : miniApp.scope;
}

/**
 * Yüklenmeye başlayan ana sayfa izin verilen adreslerin dışında mı? Boş sayfa içerik taşımadığı
 * için dışarıda sayılmaz.
 *
 * Gezinme kilidi kapsam dışı adresi açtırmaz; ama Android'de WebView kitaplığı, kilidin yanıtı
 * çeyrek saniye içinde gelmezse gezinmeye izin verir. Bu denetim ikinci hattır: kilidi aşan bir
 * sayfa yüklenmeye başladığında kabuk görünümü kaldırır.
 */
export function hasLeftScope(url: string, scope: readonly string[]): boolean {
  return url !== BLANK_PAGE && !isInScope(url, scope);
}

/**
 * Köprü iletisi mini uygulamanın kendi sayfasından mı geliyor?
 *
 * WebView her iletiyle birlikte bir adres bildirir; ne bildirdiği platforma göre değişir:
 * iOS'ta iletiyi gönderen çerçevenin adresi, güncel Android WebView'de gönderen çerçevenin kaynağı
 * (yol içermez), eski Android WebView'de ana sayfanın adresidir. Web önizlemesinde tarayıcı
 * gönderenin kaynağını bildirir.
 *
 * - Paketle yayınlanan kayıt: ileti sarmalayıcı belgeden gelmelidir; bildirilen adres ya
 *   sarmalayıcının adresidir ya da sarmalayıcının kaynağıdır. Paketin çerçevesi başka bir adresten
 *   ve kimliksiz bir kaynakta ("null") çalışır; köprüye sarmalayıcıyı atlayarak gönderdiği ileti
 *   kabul edilmez.
 * - Geliştirme adresiyle açılan kayıt: adres, kaydın adres kapsamında olmalıdır.
 */
export function isBridgeSender(url: string, miniApp: MiniApp): boolean {
  if (isInScope(url, mainDocumentScope(miniApp))) return true;
  if (miniApp.source !== "package") return false;
  const origin = originOf(miniApp.entryUrl);
  return origin !== null && (url === origin || url === `${origin}/`);
}
