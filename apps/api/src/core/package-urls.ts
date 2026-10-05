import { miniAppIdSchema } from "@vado/contracts";

/**
 * Uygulama kayıtlarının API üzerindeki yol öneki. Altında iki yol vardır:
 *
 * - `/apps/<uygulama kaydı>/wrapper/<özet>/`: kabuğun açtığı sarmalayıcı belge,
 * - `/apps/<uygulama kaydı>/files/<özet>/<dosya>`: paketin dosyaları.
 */
export const APPS_ROUTE_PREFIX = "/apps/";
export const WRAPPER_SEGMENT = "wrapper";
export const FILES_SEGMENT = "files";

const APP_PLACEHOLDER = "{app}";
/** `https://{app}.mini.ornek.com`: şema, yer tutucu ve onu izleyen alan adı (isteğe bağlı port). */
const APPS_ORIGIN = /^https?:\/\/\{app\}(\.[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?)$/;

/**
 * `VADO_APPS_ORIGIN` şablonunu doğrular ve alan adının `{app}` sonrasındaki bölümünü döndürür
 * (`.mini.ornek.com`); şablon geçersizse `null`.
 */
export function appsHostSuffix(template: string): string | null {
  const suffix = APPS_ORIGIN.exec(template)?.[1];
  if (suffix === undefined) return null;
  const sample = template.replace(APP_PLACEHOLDER, "ornek");
  return URL.canParse(sample) && new URL(sample).origin === sample ? suffix : null;
}

/** Uygulama kayıtlarının hangi adresten sunulduğunu bilen yardımcı. */
export interface PackageUrls {
  /** Her uygulama kaydı kendi alt alan adından mı sunuluyor? */
  readonly subdomains: boolean;
  /** Kaydın sarmalayıcı belgesinin ve dosyalarının sunulduğu kaynak (şema + alan adı + port). */
  origin: (appId: string) => string;
  /** Kaydın yayındaki sürümünün sarmalayıcı belgesi; `/` ile biter. */
  wrapperUrl: (appId: string, digest: string) => string;
  /** Kaydın yayındaki paketinin dosyalarının kök adresi; `/` ile biter. */
  filesUrl: (appId: string, digest: string) => string;
  /** İsteğin geldiği alan adı bir uygulama kaydına aitse kaydın kimliğini döndürür. */
  appOfHost: (host: string | undefined) => string | null;
}

/**
 * Kayıtlar varsayılan olarak API'nin adresinde, kayda özel bir yolun altından sunulur.
 * `appsOrigin` verilmişse her uygulama kaydı kendi alt alan adını alır: tarayıcı, kayıtları
 * birbirinden kaynak (origin) düzeyinde de ayırır.
 */
export function createPackageUrls(publicUrl: string, appsOrigin: string | null): PackageUrls {
  const suffix = appsOrigin === null ? null : appsHostSuffix(appsOrigin);
  const subdomains = appsOrigin !== null && suffix !== null;
  /** Kaydın yollarının başladığı adres: alt alan adının kökü ya da API'deki kayıt yolu. */
  const root = (appId: string) =>
    subdomains
      ? appsOrigin.replace(APP_PLACEHOLDER, appId)
      : `${publicUrl}${APPS_ROUTE_PREFIX}${appId}`;

  return {
    subdomains,
    origin: (appId) => new URL(root(appId)).origin,
    wrapperUrl: (appId, digest) => `${root(appId)}/${WRAPPER_SEGMENT}/${digest}/`,
    filesUrl: (appId, digest) => `${root(appId)}/${FILES_SEGMENT}/${digest}/`,
    appOfHost(host) {
      const name = host?.toLowerCase();
      if (suffix === null || !name?.endsWith(suffix)) return null;
      const appId = name.slice(0, -suffix.length);
      return miniAppIdSchema.safeParse(appId).success ? appId : null;
    },
  };
}
