import { z } from "zod";

import { capabilitySchema } from "./capabilities";
import { categorySchema, timestampSchema } from "./common";
import { configValuesSchema } from "./packages";

/** Mini uygulama (uygulama kaydı) kimliği: küçük harf, rakam ve tire (3-40 karakter). */
export const miniAppIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/);

/**
 * Uygulama kaydının kodunun nereden geldiği.
 *
 * - `package`: VADO'ya yüklenmiş, incelenmiş ve değiştirilemeyen paket; VADO sunar.
 * - `url`: geliştiricinin kendi sunucusu. Yalnızca geliştirme ortamında, kod yazarken kullanılır.
 */
export const MINI_APP_SOURCES = ["package", "url"] as const;
export const miniAppSourceSchema = z.enum(MINI_APP_SOURCES);
export type MiniAppSource = z.infer<typeof miniAppSourceSchema>;

/**
 * Uygulama kaydının kullanıcılara kapalı olma nedeni. Bir kayıt ancak doğrulanmış, açık ve
 * çalıştırılabilir bir sürüme sahipse kullanıcılara görünür.
 */
export const MINI_APP_OFFLINE_REASONS = [
  "disabled",
  "unverified",
  "unpublished",
  "version_unavailable",
  "url_mode_disabled",
] as const;
export const miniAppOfflineReasonSchema = z.enum(MINI_APP_OFFLINE_REASONS);
export type MiniAppOfflineReason = z.infer<typeof miniAppOfflineReasonSchema>;

export const MINI_APP_OFFLINE_REASON_LABELS: Record<MiniAppOfflineReason, string> = {
  disabled: "Kapatıldı",
  unverified: "Doğrulanmadı",
  unpublished: "Sürüm yayınlanmadı",
  version_unavailable: "Yayındaki sürüm geri çekildi",
  url_mode_disabled: "Adresle açılan kayıtlar bu ortamda çalışmaz",
};

export const miniAppSchema = z.object({
  id: miniAppIdSchema,
  name: z.string(),
  description: z.string(),
  iconUrl: z.string().nullable(),
  category: categorySchema,
  developerName: z.string(),
  verified: z.boolean(),
  source: miniAppSourceSchema,
  version: z.string(),
  capabilities: z.array(capabilitySchema),
  /**
   * Kabuğun açtığı adres. Paketle yayınlanan kayıtta VADO'nun sarmalayıcı belgesidir; paket onun
   * içindeki çerçevede çalışır. Geliştirme adresiyle açılan kayıtta sayfanın kendisidir.
   */
  entryUrl: z.string(),
  /**
   * Mini uygulamanın penceresinde yüklenebilecek adres önekleri; bunların dışındaki adresler
   * açılmaz. Paketle yayınlanan kayıtta sarmalayıcı belge ve paketin dosyalarıdır.
   */
  scope: z.array(z.string()),
  /**
   * Yetkilerin ve bağlanılan adreslerin özeti. Değiştiğinde kullanıcının daha önce verdiği izinler
   * geçersiz sayılır ve yeniden sorulur.
   */
  consentKey: z.string(),
});
export type MiniApp = z.infer<typeof miniAppSchema>;

/** Kabuğun mini uygulamayı açarken okuduğu kayıt: işletmenin ayarlarını da taşır. */
export const miniAppDetailSchema = miniAppSchema.extend({
  /** İşletmeye özel ayarlar. Mini uygulamaya açıkça verilir; gizli değer içermemelidir. */
  config: configValuesSchema,
});
export type MiniAppDetail = z.infer<typeof miniAppDetailSchema>;

export const miniAppListQuerySchema = z.object({
  category: categorySchema.optional(),
});
export type MiniAppListQuery = z.infer<typeof miniAppListQuerySchema>;

/**
 * Mini uygulamaya verilen kimlik. `openId` her uygulama kaydı için farklıdır;
 * böylece mini uygulamalar aynı kullanıcıyı birbirleriyle eşleştiremez.
 */
export const miniAppIdentitySchema = z.object({
  openId: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
});
export type MiniAppIdentity = z.infer<typeof miniAppIdentitySchema>;

/** Kimlik belirtecinin ömrü: mini uygulama onu hemen kendi sunucusuna gönderir. */
export const IDENTITY_TOKEN_TTL_SECONDS = 300;

/**
 * Mini uygulamanın kendi sunucusuna gönderdiği kimlik belirteci: VADO'nun Ed25519 ile imzaladığı
 * bir JWT. Sunucu onu VADO'nun yayımladığı açık anahtarlarla doğrular; `sub` kullanıcının o kayda
 * özgü `openId` değeri, `aud` uygulama kaydının kimliğidir.
 */
export const miniAppIdentityTokenSchema = z.object({
  token: z.string(),
  expiresAt: timestampSchema,
});
export type MiniAppIdentityToken = z.infer<typeof miniAppIdentityTokenSchema>;

/** Kimlik belirteçlerini doğrulayan açık anahtarlar (JWKS, RFC 7517; anahtarlar RFC 8037). */
export const identityKeySetSchema = z.object({
  keys: z.array(
    z.object({
      kty: z.literal("OKP"),
      crv: z.literal("Ed25519"),
      x: z.string(),
      kid: z.string(),
      use: z.literal("sig"),
      alg: z.literal("EdDSA"),
    }),
  ),
});
export type IdentityKeySet = z.infer<typeof identityKeySetSchema>;

/** Bir adresin kaynağını (şema + alan adı + port) döndürür; adres geçersizse `null`. */
export function originOf(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

/**
 * Adres, mini uygulamanın gezinebileceği öneklerden biriyle başlıyorsa `true` döner. Karşılaştırma
 * çözümlenmiş adresle yapılır; `..` içeren ya da alan adını taklit eden yazımlar öneki geçemez.
 * Önekler `/` ile biter.
 */
export function isInScope(url: string, scope: readonly string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;
  return scope.some((prefix) => prefix.endsWith("/") && parsed.href.startsWith(prefix));
}
