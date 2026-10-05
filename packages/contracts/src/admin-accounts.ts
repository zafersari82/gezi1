import { z } from "zod";

import { idSchema, timestampSchema } from "./common";

/*
 * Yönetim panelinin hesapları, rolleri ve izinleri.
 *
 * Yetki iki ayrı sorudur: hesabın rolü hangi işleri yapabilir (izin) ve bu işleri hangi kayıtlar
 * üzerinde yapabilir (kapsam). VADO ekibinin hesapları bütün kayıtlar üzerinde çalışır. İşletme
 * hesabı (2.5) bir işletmeye bağlıdır ve yalnızca o işletmenin satıcı olarak bağlı olduğu uygulama
 * kayıtlarını görür. İzin listesi ve rol-izin tablosu tek yerde, burada durur: API her uçta bu
 * tabloya bakar, panel menüyü bu tabloya göre çizer.
 */

export const ADMIN_ROLES = [
  "owner",
  "reviewer",
  "operator",
  "support",
  "auditor",
  "business",
] as const;
export const adminRoleSchema = z.enum(ADMIN_ROLES);
export type AdminRole = z.infer<typeof adminRoleSchema>;

export const ADMIN_ROLE_LABELS: Record<AdminRole, string> = {
  owner: "Sahip",
  reviewer: "İnceleyen",
  operator: "Operatör",
  support: "Destek",
  auditor: "Denetçi",
  business: "İşletme",
};

/** Rolün panelde, hesap oluşturulurken gösterilen kısa açıklaması. */
export const ADMIN_ROLE_DESCRIPTIONS: Record<AdminRole, string> = {
  owner: "Her şey: hesaplar ve roller dahil.",
  reviewer: "Paket sürümlerini onaylar ve reddeder; acil kapatma yapabilir.",
  operator: "Paket yükler, uygulama kayıtlarını yönetir ve yayınlar, işletmeleri onaylar.",
  support: "Kullanıcıları askıya alır, şikayetleri sonuçlandırır.",
  auditor: "Her şeyi okur, hiçbir şeyi değiştiremez.",
  business:
    "Bir işletmenin hesabı: yalnızca kendi mini uygulamalarını görür, ayarlarını değiştirir ve QR kodu üretir.",
};

export const ADMIN_PERMISSIONS = [
  "overview.read",
  "users.read",
  "users.manage",
  "businesses.read",
  "businesses.manage",
  "reports.read",
  "reports.manage",
  "audit.read",
  "packages.read",
  "packages.upload",
  "packages.review",
  "packages.rollout",
  "miniapps.read",
  "miniapps.manage",
  /** Uygulama kaydının işletme ayarlarını değiştirmek ve QR kodu üretmek (2.5). */
  "miniapps.configure",
  "miniapps.publish",
  /** Acil kapatma: uygulama kaydını kapatmak ya da onaylı sürümü geri çekmek. */
  "emergency.disable",
  "accounts.manage",
] as const;
export const adminPermissionSchema = z.enum(ADMIN_PERMISSIONS);
export type AdminPermission = z.infer<typeof adminPermissionSchema>;

const READ_ALL: AdminPermission[] = ADMIN_PERMISSIONS.filter((permission) =>
  permission.endsWith(".read"),
);

/** Her rolün izinleri. Bir izin burada yazmıyorsa o rol için yoktur. */
export const ADMIN_ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  owner: ADMIN_PERMISSIONS,
  reviewer: [
    "overview.read",
    "audit.read",
    "packages.read",
    "packages.review",
    "miniapps.read",
    "emergency.disable",
  ],
  operator: [
    "overview.read",
    "businesses.read",
    "businesses.manage",
    "packages.read",
    "packages.upload",
    "packages.rollout",
    "miniapps.read",
    "miniapps.manage",
    "miniapps.configure",
    "miniapps.publish",
    "emergency.disable",
  ],
  support: [
    "overview.read",
    "users.read",
    "users.manage",
    "businesses.read",
    "reports.read",
    "reports.manage",
    "miniapps.read",
  ],
  auditor: READ_ALL,
  business: ["miniapps.read", "miniapps.configure"],
};

/** Bir işletmeye bağlı, kapsamlı roller. Bu rollerin hesapları bir işletme olmadan açılamaz. */
export const SCOPED_ROLES: readonly AdminRole[] = ["business"];

/**
 * Uçları kapsamı uygulayan izinler: bu izinleri isteyen uçlar, kapsamlı hesaba yalnızca kendi
 * işletmesinin kayıtlarını gösterir. Kapsamlı bir hesap bu listede olmayan bir izni isteyen uca
 * erişemez; rol tablosu yanlışlıkla genişletilse bile API reddeder.
 */
export const SCOPED_PERMISSIONS: readonly AdminPermission[] = [
  "miniapps.read",
  "miniapps.configure",
];

export function isScopedRole(role: AdminRole): boolean {
  return SCOPED_ROLES.includes(role);
}

/**
 * Hesap olmayan işlem yapanlar ve panelde görünen adları. `admin`, 2.4'ten önceki ortak panel
 * hesabıdır ve yalnızca eski kayıtlarda görünür.
 */
export const SYSTEM_ACTOR_LABELS: Record<string, string> = {
  admin: "Ortak panel hesabı (2.3)",
  cli: "Komut satırı",
  anonymous: "Bilinmeyen hesap",
};

/**
 * Bir işlemi yapan: panel hesabı, kullanıcı ya da sistem. `id` kayıtta yazan değerdir (hesabın ya
 * da kullanıcının kimliği, ya da `SYSTEM_ACTOR_LABELS` anahtarlarından biri); `name` gösterilecek
 * addır.
 */
export const actorSchema = z.object({
  id: z.string(),
  name: z.string(),
});
export type Actor = z.infer<typeof actorSchema>;

export function roleHasPermission(role: AdminRole, permission: AdminPermission): boolean {
  return ADMIN_ROLE_PERMISSIONS[role].includes(permission);
}

export const ADMIN_PASSWORD_MIN_LENGTH = 12;
export const ADMIN_PASSWORD_MAX_LENGTH = 128;
export const RECOVERY_CODE_COUNT = 10;

export const adminUsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{2,31}$/, {
    error:
      "Kullanıcı adı 3-32 karakter olmalı; küçük harf, rakam, nokta, tire ve alt çizgi içerebilir.",
  });

export const adminPasswordSchema = z
  .string()
  .min(ADMIN_PASSWORD_MIN_LENGTH, {
    error: `Parola en az ${ADMIN_PASSWORD_MIN_LENGTH} karakter olmalı.`,
  })
  .max(ADMIN_PASSWORD_MAX_LENGTH);

export const totpCodeSchema = z.string().regex(/^\d{6}$/);

/** Kurtarma kodu `abcd-efgh-ijkl-mnop` biçimindedir; tireler ve büyük harf yok sayılır. */
export const recoveryCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replaceAll("-", ""))
  .pipe(z.string().regex(/^[a-z2-7]{16}$/));

export const adminAccountStatusSchema = z.enum(["active", "disabled"]);
export type AdminAccountStatus = z.infer<typeof adminAccountStatusSchema>;

export const adminAccountSchema = z.object({
  id: idSchema,
  username: z.string(),
  displayName: z.string(),
  role: adminRoleSchema,
  /** Kapsamlı hesabın bağlı olduğu işletme; VADO ekibinin hesaplarında boştur. */
  business: z.object({ id: idSchema, name: z.string() }).nullable(),
  status: adminAccountStatusSchema,
  /** İki adımlı doğrulama kurulmuş mu? Kurulmamışsa bir sonraki girişte kurulur. */
  totpEnabled: z.boolean(),
  /** Parola başkası tarafından belirlendi (ilk hesap, sıfırlama); ilk girişte değiştirilir. */
  mustChangePassword: z.boolean(),
  /** Hatalı denemeler yüzünden kilitliyse kilidin açılacağı an. */
  lockedUntil: timestampSchema.nullable(),
  lastLoginAt: timestampSchema.nullable(),
  createdAt: timestampSchema,
});
export type AdminAccount = z.infer<typeof adminAccountSchema>;

/** Giriş yapmış hesabın kendisi ve yapabildikleri; panel menüyü buna göre çizer. */
export const adminMeSchema = z.object({
  account: adminAccountSchema,
  permissions: z.array(adminPermissionSchema),
});
export type AdminMe = z.infer<typeof adminMeSchema>;

// -- Giriş ------------------------------------------------------------------

export const adminLoginBodySchema = z.object({
  username: z.string().trim().toLowerCase().min(1).max(64),
  password: z.string().min(1).max(ADMIN_PASSWORD_MAX_LENGTH),
});
export type AdminLoginBody = z.infer<typeof adminLoginBodySchema>;

/**
 * Parola doğrulandıktan sonra açılan yarım oturum. Bu belirteçle yalnızca ikinci adım yapılabilir:
 * `totp` kodu sorar, `totp_setup` ikinci adımın kurulmasını ister.
 */
export const adminLoginResultSchema = z.object({
  token: z.string(),
  expiresAt: timestampSchema,
  next: z.enum(["totp", "totp_setup"]),
});
export type AdminLoginResult = z.infer<typeof adminLoginResultSchema>;

/** İkinci adım: doğrulama uygulamasındaki kod ya da tek kullanımlık kurtarma kodu. */
export const adminSecondFactorBodySchema = z.union([
  z.object({ code: totpCodeSchema }),
  z.object({ recoveryCode: recoveryCodeSchema }),
]);
export type AdminSecondFactorBody = z.infer<typeof adminSecondFactorBodySchema>;

/** İkinci adımın kurulumu: sır ve doğrulama uygulamasına okutulacak adres. */
export const adminTotpSetupSchema = z.object({
  secret: z.string(),
  uri: z.string(),
});
export type AdminTotpSetup = z.infer<typeof adminTotpSetupSchema>;

export const adminTotpConfirmBodySchema = z.object({ code: totpCodeSchema });
export type AdminTotpConfirmBody = z.infer<typeof adminTotpConfirmBodySchema>;

/**
 * İkinci adım geçildi; oturum açıldı. Belirteç yarım oturumunkinden farklıdır. Kurulumun sonunda
 * kurtarma kodları yalnızca bu yanıtta, bir kez döner.
 */
export const adminSessionResultSchema = z.object({
  token: z.string(),
  expiresAt: timestampSchema,
  recoveryCodes: z.array(z.string()).nullable(),
});
export type AdminSessionResult = z.infer<typeof adminSessionResultSchema>;

// -- Kendi hesabım ----------------------------------------------------------

export const adminChangePasswordBodySchema = z.object({
  currentPassword: z.string().min(1).max(ADMIN_PASSWORD_MAX_LENGTH),
  newPassword: adminPasswordSchema,
});
export type AdminChangePasswordBody = z.infer<typeof adminChangePasswordBodySchema>;

export const adminSessionSchema = z.object({
  id: idSchema,
  createdAt: timestampSchema,
  lastSeenAt: timestampSchema,
  expiresAt: timestampSchema,
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  current: z.boolean(),
});
export type AdminSession = z.infer<typeof adminSessionSchema>;

export const adminRecoveryCodesSchema = z.object({
  recoveryCodes: z.array(z.string()),
});
export type AdminRecoveryCodes = z.infer<typeof adminRecoveryCodesSchema>;

// -- Hesap yönetimi (yalnızca sahip) ----------------------------------------

export const adminDisplayNameSchema = z.string().trim().min(2).max(60);

export const adminCreateAccountBodySchema = z
  .object({
    username: adminUsernameSchema,
    displayName: adminDisplayNameSchema,
    role: adminRoleSchema,
    /** Kapsamlı rollerde zorunlu, diğerlerinde yazılmaz. */
    businessId: idSchema.optional(),
  })
  .refine((body) => isScopedRole(body.role) === (body.businessId !== undefined), {
    error: "İşletme hesabı bir işletmeye bağlanmalı; diğer roller bağlanmaz.",
    path: ["businessId"],
  });
export type AdminCreateAccountBody = z.infer<typeof adminCreateAccountBodySchema>;

export const adminUpdateAccountBodySchema = z
  .object({
    displayName: adminDisplayNameSchema.optional(),
    role: adminRoleSchema.optional(),
    status: adminAccountStatusSchema.optional(),
  })
  .refine(
    (body) =>
      body.displayName !== undefined || body.role !== undefined || body.status !== undefined,
    { error: "En az bir alan değişmeli." },
  );
export type AdminUpdateAccountBody = z.infer<typeof adminUpdateAccountBodySchema>;

/** Yeni hesap ya da parola sıfırlama: geçici parola yalnızca bu yanıtta, bir kez döner. */
export const adminTemporaryPasswordSchema = z.object({
  account: adminAccountSchema,
  temporaryPassword: z.string(),
});
export type AdminTemporaryPassword = z.infer<typeof adminTemporaryPasswordSchema>;
