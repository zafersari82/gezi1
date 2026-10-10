import { z } from "zod";

import { businessMemberRoleSchema } from "./business-management";
import { idSchema, timestampSchema } from "./common";

/** Teslimat görevlisi rolü; çekirdeğe sektör adı taşınmaz. */
export const DELIVERY_AGENT_ROLE = "courier" as const;

/**
 * İşletme içi yetkinin tek kataloğu. Sahip ve yönetici bütün izinlere işletme genelinde sahiptir;
 * personel yalnız kendisine verilen izinleri, verildiği kapsamda kullanır. Yeni bir modül kendi
 * iznini buraya ekler; ayrı izin tablosu açılmaz.
 */
export const businessPermissionSchema = z.enum([
  "orders.view",
  "orders.manage",
  "tables.serve",
  "catalog.availability",
  "reviews.reply",
  "reports.view",
]);
export type BusinessPermission = z.infer<typeof businessPermissionSchema>;

export interface BusinessPermissionDefinition {
  label: string;
  description: string;
  /** Bu izinle birlikte aynı kapsamda kendiliğinden verilen izinler. */
  implies: readonly BusinessPermission[];
  /** İzni anlamlı kılan yetenek paketi; `null` ise platform servisidir. */
  capability: string | null;
}

export const BUSINESS_PERMISSIONS: Readonly<
  Record<BusinessPermission, BusinessPermissionDefinition>
> = {
  "orders.view": {
    label: "Siparişleri görme",
    description: "Sipariş listesi, ayrıntısı ve canlı sipariş olayları.",
    implies: [],
    capability: null,
  },
  "orders.manage": {
    label: "Siparişleri işleme",
    description:
      "Kabul, ret, durum ilerletme ve kapıda tahsilat kaydı. İptal ve iade sahibe aittir.",
    implies: ["orders.view"],
    capability: null,
  },
  "tables.serve": {
    label: "Masa servisi",
    description: "Masa oturumları, garson çağrıları ve hesap istekleri.",
    implies: [],
    capability: "ordering.table_service",
  },
  "catalog.availability": {
    label: "Ürün bulunurluğu",
    description: "Şubede ürünü satışa açma ya da tükendi olarak işaretleme. Fiyat değiştiremez.",
    implies: [],
    capability: null,
  },
  "reviews.reply": {
    label: "Değerlendirmelere yanıt",
    description: "Müşteri değerlendirmelerini görme ve işletme adına yanıt yazma.",
    implies: [],
    capability: null,
  },
  "reports.view": {
    label: "Raporlar",
    description: "Şube sipariş sayıları ve tamamlanan sipariş tutarları.",
    implies: [],
    capability: null,
  },
};

/** İznin geçerli olduğu yer: işletmenin tamamı, bir bölgenin şubeleri ya da tek şube. */
export const accessScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("business") }).strict(),
  z.object({ kind: z.literal("region"), regionId: idSchema }).strict(),
  z.object({ kind: z.literal("branch"), branchId: idSchema }).strict(),
]);
export type AccessScope = z.infer<typeof accessScopeSchema>;

export const accessGrantSchema = z
  .object({ permission: businessPermissionSchema, scope: accessScopeSchema })
  .strict();
export type AccessGrant = z.infer<typeof accessGrantSchema>;

export const MAX_ACCESS_GRANTS = 200;

function scopeKey(scope: AccessScope): string {
  if (scope.kind === "region") return `region:${scope.regionId}`;
  if (scope.kind === "branch") return `branch:${scope.branchId}`;
  return "business";
}

/**
 * İzin listesini tek biçime getirir: içerilen izinleri ekler, tekrarları atar ve sıralar.
 * Sunucu yalnız bu biçimi saklar; aynı istek her cihazdan aynı sonucu verir.
 */
export function normaliseAccessGrants(grants: readonly AccessGrant[]): AccessGrant[] {
  const result = new Map<string, AccessGrant>();
  const add = (grant: AccessGrant) => {
    const key = `${grant.permission}|${scopeKey(grant.scope)}`;
    if (result.has(key)) return;
    result.set(key, grant);
    for (const implied of BUSINESS_PERMISSIONS[grant.permission].implies)
      add({ permission: implied, scope: grant.scope });
  };
  for (const grant of grants) add(grant);
  return [...result.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([, grant]) => grant);
}

const accessGrantListSchema = z.array(accessGrantSchema).max(MAX_ACCESS_GRANTS);

/** Bir personelin bütün izinleri tek seferde değiştirilir; sürüm başka cihazın kaydını ezmez. */
export const memberAccessBodySchema = z
  .object({ grants: accessGrantListSchema, expectedVersion: z.number().int().positive() })
  .strict();
export type MemberAccessBody = z.infer<typeof memberAccessBodySchema>;

/** Kapsamın ekranda okunacak adı: bölge ya da şube adı; işletme genelinde `null`. */
export const accessGrantViewSchema = accessGrantSchema.extend({
  scopeName: z.string().nullable(),
});
export type AccessGrantView = z.infer<typeof accessGrantViewSchema>;

export const memberAccessSchema = z.object({
  memberId: idSchema,
  userId: idSchema,
  displayName: z.string(),
  role: businessMemberRoleSchema,
  active: z.boolean(),
  version: z.number().int().positive(),
  grants: z.array(accessGrantViewSchema),
});
export type MemberAccess = z.infer<typeof memberAccessSchema>;
export const memberAccessListSchema = z.object({ items: z.array(memberAccessSchema) });

/** Oturumdaki kişinin bu işletmede kullanabildiği izinler; `branchIds: null` bütün şubelerdir. */
export const myBusinessAccessSchema = z.object({
  role: z.enum(["owner", "manager", "staff"]),
  permissions: z.array(
    z.object({ permission: businessPermissionSchema, branchIds: z.array(idSchema).nullable() }),
  ),
});
export type MyBusinessAccess = z.infer<typeof myBusinessAccessSchema>;

/** Bölge şubeleri gruplar; kendi başına yetki vermez. */
export const businessRegionBodySchema = z
  .object({ name: z.string().trim().min(1).max(80) })
  .strict();
export const businessRegionUpdateSchema = businessRegionBodySchema
  .extend({ expectedVersion: z.number().int().positive() })
  .strict();
export const businessRegionSchema = z.object({
  id: idSchema,
  name: z.string(),
  version: z.number().int().positive(),
  branchIds: z.array(idSchema),
});
export type BusinessRegion = z.infer<typeof businessRegionSchema>;
export const businessRegionsSchema = z.object({ items: z.array(businessRegionSchema) });
/** Şube en çok bir bölgededir; beklenen eski bölge başka cihazın değişikliğini ezmeyi önler. */
export const branchRegionBodySchema = z
  .object({ regionId: idSchema.nullable(), expectedRegionId: idSchema.nullable() })
  .strict();
export type BranchRegionBody = z.infer<typeof branchRegionBodySchema>;

/** Davet telefon numarasına bağlıdır ve yalnız personel üyeliği ile seçilen izinleri verir. */
export const staffInvitationCreateSchema = z
  .object({
    phone: z.string().trim().min(8).max(32),
    grants: accessGrantListSchema.min(1),
  })
  .strict();
export type StaffInvitationCreate = z.infer<typeof staffInvitationCreateSchema>;
export const staffInvitationTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const staffInvitationTokenBodySchema = z
  .object({ token: staffInvitationTokenSchema })
  .strict();
export const staffInvitationSchema = z.object({
  id: idSchema,
  phone: z.string(),
  grants: z.array(accessGrantViewSchema),
  expiresAt: timestampSchema,
  status: z.enum(["pending", "expired", "accepted", "revoked"]),
});
export type StaffInvitation = z.infer<typeof staffInvitationSchema>;
export const staffInvitationsSchema = z.object({ items: z.array(staffInvitationSchema) });
export const staffInvitationCreatedSchema = z.object({
  invitation: staffInvitationSchema,
  token: staffInvitationTokenSchema,
});
export const staffInvitationPreviewSchema = z.object({
  businessName: z.string(),
  grants: z.array(accessGrantViewSchema),
  expiresAt: timestampSchema,
});
export type StaffInvitationPreview = z.infer<typeof staffInvitationPreviewSchema>;
export const staffInvitationAcceptedSchema = z.object({ businessId: idSchema });
