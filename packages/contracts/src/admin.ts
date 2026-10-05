import { z } from "zod";

import { actorSchema } from "./admin-accounts";
import { businessSchema, businessStatusSchema } from "./businesses";
import { CAPABILITIES, capabilitySchema } from "./capabilities";
import { categorySchema, idSchema, timestampSchema } from "./common";
import { miniAppIdSchema, miniAppOfflineReasonSchema, miniAppSourceSchema } from "./miniapps";
import {
  configFieldSchema,
  configValuesSchema,
  packageIdSchema,
  packageVersionStatusSchema,
  versionSchema,
} from "./packages";
import { merchantIdSchema, paymentModeSchema } from "./payments";
import { reportReasonSchema, reportTargetTypeSchema } from "./reports";
import { userRefSchema } from "./users";

/** Yönetim uç noktaları bu başlıkta yönetici anahtarı bekler. Anahtar yalnızca panel sunucusunda durur. */
export const ADMIN_KEY_HEADER = "x-vado-admin-key";

/**
 * Panel sunucusu, yöneticinin tarayıcısının IP adresini ve tarayıcı bilgisini bu başlıklarla
 * iletir; oturum listesinde ve denetim kaydında panel sunucusunun değil yöneticinin adresi görünür.
 * API bu başlıklara yalnızca yönetici anahtarı doğrulandıktan sonra bakar.
 */
export const ADMIN_CLIENT_IP_HEADER = "x-vado-client-ip";
export const ADMIN_CLIENT_AGENT_HEADER = "x-vado-client-agent";

export const adminOverviewSchema = z.object({
  users: z.number().int(),
  newUsersToday: z.number().int(),
  activeBusinesses: z.number().int(),
  pendingBusinesses: z.number().int(),
  publishedMiniApps: z.number().int(),
  /** Kullanıma açık olduğu halde henüz doğrulanmamış (kullanıcılara görünmeyen) mini uygulamalar. */
  unverifiedMiniApps: z.number().int(),
  /** Geliştiricinin sunucusundan açılan kayıtlar; canlı ortamda kullanıcılara kapalıdır. */
  urlMiniApps: z.number().int(),
  messagesToday: z.number().int(),
  paymentsToday: z.number().int(),
  openReports: z.number().int(),
  /** İncelenmeyi bekleyen paket sürümleri. */
  packagesInReview: z.number().int(),
  config: z.object({
    demoMode: z.boolean(),
    paymentMode: paymentModeSchema,
    sessionDays: z.number().int(),
    userQrTtlSeconds: z.number().int(),
    corsOrigins: z.array(z.string()),
    /** Adresle açılan geliştirme kayıtlarına izin var mı? Canlı ortamda `false`. */
    miniAppDevMode: z.boolean(),
    /** Yüklenebilecek paket arşivinin en büyük boyutu (bayt). */
    packageMaxBytes: z.number().int(),
  }),
});
export type AdminOverview = z.infer<typeof adminOverviewSchema>;

export const userStatusSchema = z.enum(["active", "suspended", "deleted"]);
export type UserStatus = z.infer<typeof userStatusSchema>;

export const adminUserSchema = z.object({
  id: idSchema,
  phone: z.string().nullable(),
  displayName: z.string().nullable(),
  username: z.string().nullable(),
  status: userStatusSchema,
  createdAt: timestampSchema,
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminSearchQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
});
export type AdminSearchQuery = z.infer<typeof adminSearchQuerySchema>;

export const adminUpdateUserBodySchema = z.object({
  status: z.enum(["active", "suspended"]),
});
export type AdminUpdateUserBody = z.infer<typeof adminUpdateUserBodySchema>;

export const adminBusinessSchema = businessSchema.extend({
  taxNumber: z.string().nullable(),
  owner: userRefSchema,
  /** Sahibinin hesabı etkin değilse işletme yayınlanamaz. */
  ownerStatus: userStatusSchema,
  createdAt: timestampSchema,
});
export type AdminBusiness = z.infer<typeof adminBusinessSchema>;

export const adminUpdateBusinessBodySchema = z
  .object({
    verified: z.boolean().optional(),
    status: businessStatusSchema.optional(),
  })
  .refine((body) => body.verified !== undefined || body.status !== undefined);
export type AdminUpdateBusinessBody = z.infer<typeof adminUpdateBusinessBodySchema>;

/** Bir satıcının bir mini uygulama üzerinden ödeme alabilmesi için gereken eşleştirme. */
export const merchantBindingSchema = z.object({
  merchantId: merchantIdSchema,
  displayName: z.string(),
  businessId: idSchema.nullable(),
  active: z.boolean(),
});
export type MerchantBinding = z.infer<typeof merchantBindingSchema>;

export const MINI_APP_RELEASE_ACTIONS = ["publish", "rollback", "config"] as const;
export type MiniAppReleaseAction = (typeof MINI_APP_RELEASE_ACTIONS)[number];

export const MINI_APP_RELEASE_ACTION_LABELS: Record<MiniAppReleaseAction, string> = {
  publish: "Yayınlandı",
  rollback: "Geri alındı",
  config: "Ayarlar değişti",
};

/**
 * Uygulama kaydının yayın geçmişindeki bir adım: o andan sonra yayında olan sürüm ve ayarlar.
 * Geçmişe yalnızca ekleme yapılır; geri alma, bir önceki yayını ayarlarıyla birlikte geri getirir.
 */
export const miniAppReleaseSchema = z.object({
  seq: z.number().int(),
  packageId: packageIdSchema,
  version: versionSchema,
  action: z.enum(MINI_APP_RELEASE_ACTIONS),
  config: configValuesSchema,
  actor: actorSchema,
  createdAt: timestampSchema,
});
export type MiniAppRelease = z.infer<typeof miniAppReleaseSchema>;

export const adminMiniAppSummarySchema = z.object({
  id: miniAppIdSchema,
  name: z.string(),
  description: z.string(),
  /** Kullanıcıların gördüğü simge: kaydın kendi simgesi, yoksa yayındaki paketin simgesi. */
  iconUrl: z.string().nullable(),
  /** Kaydın kendi simgesi; paketin simgesi kullanılıyorsa `null`. */
  customIconUrl: z.string().nullable(),
  category: categorySchema,
  developerName: z.string(),
  source: miniAppSourceSchema,
  verified: z.boolean(),
  enabled: z.boolean(),
  /** Kayıt kullanıcılara neden kapalı? Açıksa `null`. */
  offlineReason: miniAppOfflineReasonSchema.nullable(),
  sortOrder: z.number().int(),
  /** Yayındaki sürüm; paketle yayınlanan kayıtta ilk yayına kadar `null`. */
  version: z.string().nullable(),
  /** Yürürlükteki yetkiler: paketle yayınlanan kayıtta yayındaki sürümün istedikleri. */
  capabilities: z.array(capabilitySchema),
  /** Kabuğun açtığı adres; yayınlanmış bir sürüm yoksa `null`. */
  entryUrl: z.string().nullable(),
  /** Yayındaki paket sürümü. Hiç yayın yapılmadıysa ya da kayıt adresle açılıyorsa `null`. */
  release: z
    .object({
      packageId: packageIdSchema,
      packageName: z.string(),
      version: versionSchema,
      status: packageVersionStatusSchema,
      digest: z.string(),
      network: z.array(z.string()),
      configFields: z.array(configFieldSchema),
    })
    .nullable(),
  /** İşletmeye özel ayarlar; yayındaki sürümün bildirdiği alanlara göre doğrulanmıştır. */
  config: configValuesSchema,
  /** Yalnızca adresle açılan geliştirme kayıtlarında: geliştiricinin sunucusu. */
  development: z.object({ entryUrl: z.string(), allowedOrigins: z.array(z.string()) }).nullable(),
  merchants: z.array(merchantBindingSchema),
  updatedAt: timestampSchema,
});
export type AdminMiniAppSummary = z.infer<typeof adminMiniAppSummarySchema>;

export const adminMiniAppSchema = adminMiniAppSummarySchema.extend({
  /** Yayın geçmişinin son adımları, en yenisi başta. */
  releases: z.array(miniAppReleaseSchema),
});
export type AdminMiniApp = z.infer<typeof adminMiniAppSchema>;

/**
 * Uygulama kaydının vitrin bilgileri. `development` verilirse kayıt, geliştiricinin kendi
 * sunucusundan açılır; bu yalnızca geliştirme ortamında kabul edilir. Verilmezse kayıt bir paket
 * sürümü yayınlanana kadar kullanıcılara kapalıdır.
 */
export const adminSaveMiniAppBodySchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().min(10).max(300),
  iconUrl: z.url().nullable().optional(),
  category: categorySchema,
  developerName: z.string().trim().min(2).max(80),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
  development: z
    .object({
      entryUrl: z.url(),
      allowedOrigins: z.array(z.url()).min(1).max(10),
      capabilities: z.array(capabilitySchema).max(CAPABILITIES.length),
      version: versionSchema,
    })
    .optional(),
});
export type AdminSaveMiniAppBody = z.infer<typeof adminSaveMiniAppBodySchema>;

export const adminUpdateMiniAppBodySchema = z
  .object({
    verified: z.boolean().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((body) => body.verified !== undefined || body.enabled !== undefined);
export type AdminUpdateMiniAppBody = z.infer<typeof adminUpdateMiniAppBodySchema>;

/** Onaylı bir paket sürümünü uygulama kaydında yayınlar. Ayar verilmezse kayıtlı ayar kullanılır. */
export const adminPublishMiniAppBodySchema = z.object({
  packageId: packageIdSchema,
  version: versionSchema,
  config: z.record(z.string(), z.unknown()).optional(),
});
export type AdminPublishMiniAppBody = z.infer<typeof adminPublishMiniAppBodySchema>;

export const adminSaveMiniAppConfigBodySchema = z.object({
  config: z.record(z.string(), z.unknown()),
});
export type AdminSaveMiniAppConfigBody = z.infer<typeof adminSaveMiniAppConfigBodySchema>;

export const adminSaveMerchantBodySchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  businessId: idSchema.nullable().optional(),
  active: z.boolean().optional(),
});
export type AdminSaveMerchantBody = z.infer<typeof adminSaveMerchantBodySchema>;

export const reportStatusSchema = z.enum(["open", "resolved"]);
export type ReportStatus = z.infer<typeof reportStatusSchema>;

export const adminReportSchema = z.object({
  id: idSchema,
  reporter: userRefSchema,
  targetType: reportTargetTypeSchema,
  targetId: z.string(),
  reason: reportReasonSchema,
  note: z.string(),
  status: reportStatusSchema,
  createdAt: timestampSchema,
});
export type AdminReport = z.infer<typeof adminReportSchema>;

export const adminUpdateReportBodySchema = z.object({
  status: reportStatusSchema,
});
export type AdminUpdateReportBody = z.infer<typeof adminUpdateReportBodySchema>;

export const auditEntrySchema = z.object({
  id: z.number().int(),
  /** İşlemi yapan panel hesabı ya da kullanıcı. */
  actor: actorSchema,
  action: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: timestampSchema,
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;
