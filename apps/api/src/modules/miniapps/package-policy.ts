import { originOf } from "@vado/contracts";

import { cspHash, sha256 } from "../../core/security";
import { WRAPPER_SCRIPT, WRAPPER_STYLE } from "./wrapper-document";

/**
 * Uygulama kaydının tarayıcıdaki sınırları: sarmalayıcı belgeyle, paketin giriş belgesiyle ve
 * paketin diğer dosyalarıyla gönderilen yanıt başlıkları.
 *
 * Katmanlar birbirini tamamlar:
 *
 * - Sarmalayıcının politikası, paketin çerçevesine yalnızca giriş belgesinin yüklenmesine izin
 *   verir: paket kendi penceresini başka bir adrese götüremez.
 * - Giriş belgesinin politikası, paketin hangi kodu çalıştırabileceğini ve hangi adreslere
 *   bağlanabileceğini belirler; paketin kendi açacağı alt çerçeveleri de o engeller.
 * - Diğer dosyalar belge olarak açılamaz: pakette betik çalıştırabilen tek belge giriş belgesidir.
 */

/** Kabuğun köprü üzerinden aracılık ettiği ya da hiç sunmadığı tarayıcı özellikleri. */
const DENIED_FEATURES = [
  "camera",
  "microphone",
  "geolocation",
  "payment",
  "usb",
  "serial",
  "hid",
  "midi",
  "display-capture",
  "publickey-credentials-get",
  "clipboard-read",
];
/** Çerçeve, kendisini açan sayfadan fazlasına sahip olamaz: sarmalayıcı da aynı listeyi gönderir. */
const PERMISSIONS_POLICY = DENIED_FEATURES.map((feature) => `${feature}=()`).join(", ");

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;
/** Belgeler her açılışta sunucuya sorulur: geri çekilen sürüm ve değişen politika hemen geçerli olur. */
const REVALIDATE = "no-cache";
/** Adresi içerik özetini taşıyan dosya: aynı adres her zaman aynı içeriği verir. */
const IMMUTABLE = `public, max-age=${ONE_YEAR_SECONDS}, immutable`;

type Directive = [name: string, values: string[]];

const serialize = (directives: Directive[]) =>
  directives.map(([name, values]) => [name, ...values].join(" ")).join("; ");

/** Listedeki geçerli kaynaklar (şema + alan adı + port); hiçbiri yoksa `'none'`. */
function ancestors(origins: readonly string[]): string[] {
  const valid = origins.filter((origin) => originOf(origin) === origin);
  return valid.length > 0 ? valid : ["'none'"];
}

/**
 * Belgenin sürüm etiketi: içerikle birlikte başlıkları da kapsar. Tarayıcılar, "değişmedi"
 * yanıtında gelen güvenlik başlıklarını her zaman eskisinin yerine koymaz; politika değiştiğinde
 * etiket de değişir ve belge yeni başlıklarıyla baştan gönderilir.
 */
function documentEtag(content: string, headers: Record<string, string>): string {
  return `"${sha256(JSON.stringify([content, headers]))}"`;
}

export interface WrapperPolicy {
  /** Çerçeveye yüklenebilecek tek adres: paketin giriş belgesi. */
  entryUrl: string;
  /** Sarmalayıcıyı çerçeve içinde gösterebilecek kaynaklar: web önizlemesinin adresleri. */
  frameAncestors: readonly string[];
}

/**
 * Sarmalayıcı belgeyle gönderilen başlıklar.
 *
 * - `frame-src`: çerçeveye yalnızca giriş belgesi yüklenebilir. Tarayıcı bu kısıtı çerçevenin
 *   kendi başlattığı gezinmelere de uygular; başka adrese giden istek gönderilmeden reddedilir.
 * - Belge yalnızca kendi betiğini ve stilini çalıştırır (içerik özetiyle); hiçbir yere bağlanmaz.
 * - Kum havuzu (`sandbox`) burada değil, çerçevenin kendisindedir: sarmalayıcı kendi kaynağında
 *   kalır ki giriş belgesi "beni yalnızca bu kaynak çerçeveleyebilir" diyebilsin.
 */
export function wrapperHeaders(policy: WrapperPolicy, body: string): Record<string, string> {
  const headers = {
    "content-security-policy": serialize([
      ["default-src", ["'none'"]],
      ["frame-src", [policy.entryUrl]],
      ["script-src", [cspHash(WRAPPER_SCRIPT)]],
      ["style-src", [cspHash(WRAPPER_STYLE)]],
      ["base-uri", ["'none'"]],
      ["form-action", ["'none'"]],
      ["frame-ancestors", ancestors(policy.frameAncestors)],
    ]),
    "permissions-policy": PERMISSIONS_POLICY,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "cache-control": REVALIDATE,
  };
  return { ...headers, etag: documentEtag(body, headers) };
}

export interface PackagePolicy {
  /** Paketin dosyalarının kök adresi; `/` ile biter. Paket yalnızca bu adresin altına erişir. */
  filesUrl: string;
  /** Bildirim dosyasında yazan, bağlanılabilecek adresler. */
  network: readonly string[];
  /** Kullanıcı görsellerinin (profil fotoğrafı) sunulduğu adres öneki. */
  mediaUrl: string;
  /**
   * Giriş belgesini çerçeve içinde gösterebilecek kaynaklar: sarmalayıcı belgenin kaynağı ve
   * (sarmalayıcıyı o çerçevelediği için) web önizlemesinin adresleri.
   */
  frameAncestors: readonly string[];
}

/**
 * Paketin giriş belgesinin sınırları. Paket dosyaları API ile aynı alan adından sunulabildiği
 * için kaynaklar `'self'` ile değil, paketin kendi klasörüyle sınırlanır: paket başka bir paketin
 * dosyalarını da, API'yi de çağıramaz.
 *
 * - Kod yalnızca paketin kendi dosyalarından çalışır; satır içi betik, `eval` ve WebAssembly yoktur.
 * - Ağ bağlantısı yalnızca paketin kendi klasörüne ve bildirim dosyasındaki adreslere kurulur.
 * - `sandbox`: belge kimliksiz (opak) bir kaynakta çalışır; çerez, localStorage, IndexedDB ve
 *   Service Worker yoktur, yeni pencere açılamaz, üst pencere başka adrese götürülemez.
 *   `allow-forms` yalnızca formların `submit` olayının çalışması içindir; `form-action 'none'`
 *   formun bir adrese gönderilmesini engeller.
 * - `frame-src 'none'`: paket başka bir sayfayı kendi içinde çerçeveleyemez.
 *
 * Bu politika WebRTC bağlantılarını kapsamaz; tarayıcılar bunun için bir kural sunmuyor
 * (bkz. SECURITY.md, bilinen sınırlar).
 */
export function entryDocumentPolicy(policy: PackagePolicy): string {
  const { filesUrl, network, mediaUrl } = policy;
  const web = network.filter((origin) => origin.startsWith("http"));
  return serialize([
    ["default-src", ["'none'"]],
    ["script-src", [filesUrl]],
    ["style-src", [filesUrl, "'unsafe-inline'"]],
    ["img-src", [filesUrl, mediaUrl, "data:", "blob:", ...web]],
    ["font-src", [filesUrl, "data:"]],
    ["media-src", [filesUrl, "blob:", ...web]],
    ["connect-src", [filesUrl, ...network]],
    ["worker-src", ["'none'"]],
    ["frame-src", ["'none'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'none'"]],
    ["form-action", ["'none'"]],
    ["frame-ancestors", ancestors(policy.frameAncestors)],
    ["sandbox", ["allow-scripts", "allow-forms"]],
  ]);
}

/**
 * Giriş belgesi dışındaki dosyalar belge olarak açılırsa etkisizdir: çerçevede gösterilemez,
 * betik çalıştıramaz, hiçbir kaynağa erişemez. Dosyanın sayfaya görsel, betik ya da stil olarak
 * yüklenmesini etkilemez; tarayıcı bu başlığı yalnızca dosya bir belge olarak açıldığında uygular.
 */
const INERT_DOCUMENT_POLICY = serialize([
  ["default-src", ["'none'"]],
  ["frame-ancestors", ["'none'"]],
  ["sandbox", []],
]);

/** Paketin bütün dosyalarında ortak olan başlıklar. */
const FILE_HEADERS = {
  "permissions-policy": PERMISSIONS_POLICY,
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  // Belge kimliksiz bir kaynakta çalıştığı için kendi dosyalarını da "başka kaynaktan" ister.
  "access-control-allow-origin": "*",
  "cross-origin-resource-policy": "cross-origin",
};

/** Paketin giriş belgesiyle gönderilen başlıklar. */
export function entryDocumentHeaders(
  policy: PackagePolicy,
  contentDigest: string,
): Record<string, string> {
  const headers = {
    ...FILE_HEADERS,
    "content-security-policy": entryDocumentPolicy(policy),
    "cache-control": REVALIDATE,
  };
  return { ...headers, etag: documentEtag(contentDigest, headers) };
}

/** Paketin giriş belgesi dışındaki dosyalarıyla gönderilen başlıklar. */
export function packageFileHeaders(contentDigest: string): Record<string, string> {
  return {
    ...FILE_HEADERS,
    "content-security-policy": INERT_DOCUMENT_POLICY,
    "cache-control": IMMUTABLE,
    etag: `"${contentDigest}"`,
  };
}
