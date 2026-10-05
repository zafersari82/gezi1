"use server";

import {
  adminAccountSchema,
  adminApproveBodySchema,
  adminChangePasswordBodySchema,
  adminCreateAccountBodySchema,
  adminLoginBodySchema,
  adminLoginResultSchema,
  adminMiniAppSchema,
  adminPackageVersionSchema,
  adminRecoveryCodesSchema,
  adminReviewBodySchema,
  type AdminRole,
  adminRoleSchema,
  adminRolloutResultSchema,
  adminSaveMerchantBodySchema,
  adminSaveMiniAppBodySchema,
  adminSavePackageBodySchema,
  adminSecondFactorBodySchema,
  adminSessionResultSchema,
  adminTemporaryPasswordSchema,
  adminTotpConfirmBodySchema,
  adminTotpSetupSchema,
  type AdminUpdateAccountBody,
  type AdminUpdateBusinessBody,
  type AdminUpdateMiniAppBody,
  type AdminUpdateUserBody,
  configValuesSchema,
  idSchema,
  type MerchantBinding,
  merchantIdSchema,
  miniAppIdSchema,
  PACKAGE_UPLOAD_FIELD,
  packageIdSchema,
  type ReportStatus,
  versionSchema,
} from "@vado/contracts";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { toString as qrSvg } from "qrcode";
import type { z } from "zod";

import { AdminApiError, adminCall, adminGet, adminSend, getOverview } from "./api";
import {
  describeConfigProblems,
  describePackageProblems,
  readConfigFormValues,
  toConfigInput,
} from "./config-values";
import {
  type AccountFormValues,
  type ConfigFormValues,
  EMPTY_MERCHANT,
  EMPTY_NOTE,
  type FormState,
  type LoginFormValues,
  type MerchantFormValues,
  type MiniAppFormValues,
  type NoteFormValues,
  type PackageFormValues,
  type RevealedSecret,
  type TotpSetupView,
} from "./form-state";
import { packageTooLargeMessage } from "./format";
import { clearToken, PENDING_COOKIE, SESSION_COOKIE, writeToken } from "./session";

/*
 * Panelin tüm değişiklikleri bu dosyadaki sunucu işlevlerinden geçer. Her çağrı, oturum çerezindeki
 * belirteci API'ye taşır; hesabı ve izni API doğrular. İşlevlere bağlanan kimlikler tarayıcıdan
 * geldiği için API yoluna yazılmadan önce burada da biçimce doğrulanır.
 */

const FIELD_LABELS: Record<string, string> = {
  name: "Ad",
  description: "Açıklama",
  iconUrl: "Simge adresi",
  entryUrl: "Giriş adresi",
  allowedOrigins: "İzinli kaynaklar",
  capabilities: "Yetkiler",
  version: "Sürüm",
  category: "Kategori",
  developerName: "Geliştirici",
  sortOrder: "Sıra",
  displayName: "Görünen ad",
  businessId: "İşletme",
  note: "Gerekçe",
  username: "Kullanıcı adı",
  role: "Rol",
  newPassword: "Yeni parola",
  currentPassword: "Mevcut parola",
};

const ID_RULE = "Kimlik 3-40 karakter olmalı; yalnızca küçük harf, rakam ve tire içerebilir.";

function describeIssues(error: z.ZodError): string {
  const fields = error.issues.map((issue) => {
    // Geliştirme kaydının alanları `development` altında gelir; hata asıl alanın adıyla gösterilir.
    const [first, second] = issue.path;
    const field = String(first === "development" && second !== undefined ? second : first);
    return FIELD_LABELS[field] ?? field;
  });
  return `Şu alanları kontrol et: ${[...new Set(fields)].join(", ")}.`;
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** API'nin reddettiği isteğin nedenini forma taşır; beklenmeyen hatalar hata sayfasına düşer. */
function messageOf(error: unknown): string {
  if (error instanceof AdminApiError) return error.message;
  throw error;
}

const miniAppPath = (miniAppId: string) => `/v1/admin/miniapps/${miniAppIdSchema.parse(miniAppId)}`;
const packagePath = (packageId: string) => `/v1/admin/packages/${packageIdSchema.parse(packageId)}`;
const versionPath = (packageId: string, version: string) =>
  `${packagePath(packageId)}/versions/${versionSchema.parse(version)}`;

// -- Giriş ve iki adımlı doğrulama ---------------------------------------------

/**
 * Kullanıcı adı ve parolayı doğrular. Geçerse yarım oturum çereze yazılır ve ikinci adıma (ya da
 * ilk girişte ikinci adımın kurulumuna) geçilir.
 */
export async function login(
  _previous: FormState<LoginFormValues>,
  formData: FormData,
): Promise<FormState<LoginFormValues>> {
  const values: LoginFormValues = { username: text(formData, "username") };
  const body = adminLoginBodySchema.safeParse({
    username: values.username,
    password: formData.get("password"),
  });
  if (!body.success) return { error: "Kullanıcı adını ve parolanı yaz.", saved: false, values };

  let next: "totp" | "totp_setup";
  try {
    const result = await adminCall(
      adminLoginResultSchema,
      "POST",
      "/v1/admin/auth/login",
      body.data,
      "none",
    );
    await writeToken(PENDING_COOKIE, result.token);
    next = result.next;
  } catch (error) {
    return { error: messageOf(error), saved: false, values };
  }
  redirect(next === "totp" ? "/login/verify" : "/login/setup");
}

/** İkinci adım: uygulamadaki kod ya da kurtarma kodu. Geçerse oturum açılır. */
export async function verifySecondFactor(
  _previous: FormState<null>,
  formData: FormData,
): Promise<FormState<null>> {
  const code = text(formData, "code").replaceAll(" ", "");
  const recoveryCode = text(formData, "recoveryCode");
  const body = adminSecondFactorBodySchema.safeParse(
    recoveryCode === "" ? { code } : { recoveryCode },
  );
  if (!body.success) {
    return {
      error: "Uygulamadaki 6 haneli kodu ya da bir kurtarma kodunu yaz.",
      saved: false,
      values: null,
    };
  }
  try {
    const session = await adminCall(
      adminSessionResultSchema,
      "POST",
      "/v1/admin/auth/second-factor",
      body.data,
      "pending",
    );
    await writeToken(SESSION_COOKIE, session.token);
    await clearToken(PENDING_COOKIE);
  } catch (error) {
    return { error: messageOf(error), saved: false, values: null };
  }
  redirect("/");
}

/**
 * İkinci adımın kurulumunu başlatır: API yeni bir sır üretir; doğrulama uygulamasına okutulacak
 * QR kodu burada çizilir. Kurulum doğrulanana kadar sır geçerli değildir.
 */
export async function startTotpSetup(): Promise<TotpSetupView> {
  const setup = await adminCall(
    adminTotpSetupSchema,
    "POST",
    "/v1/admin/auth/totp-setup",
    undefined,
    "pending",
  );
  const svg = await qrSvg(setup.uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
  return {
    secret: setup.secret,
    qrDataUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
  };
}

/**
 * İkinci adımın kurulumunu uygulamadaki ilk kodla doğrular ve oturumu açar. Kurtarma kodları
 * yalnızca bu yanıtta döner ve formda bir kez gösterilir.
 */
export async function confirmTotpSetup(
  _previous: FormState<RevealedSecret>,
  formData: FormData,
): Promise<FormState<RevealedSecret>> {
  const body = adminTotpConfirmBodySchema.safeParse({
    code: text(formData, "code").replaceAll(" ", ""),
  });
  const failed = (error: string) => ({ error, saved: false, values: { secrets: [] } });
  if (!body.success) return failed("Uygulamadaki 6 haneli kodu yaz.");
  try {
    const session = await adminCall(
      adminSessionResultSchema,
      "POST",
      "/v1/admin/auth/totp-setup/confirm",
      body.data,
      "pending",
    );
    await writeToken(SESSION_COOKIE, session.token);
    await clearToken(PENDING_COOKIE);
    return { error: null, saved: true, values: { secrets: session.recoveryCodes ?? [] } };
  } catch (error) {
    return failed(messageOf(error));
  }
}

export async function logout(): Promise<void> {
  try {
    await adminSend("POST", "/v1/admin/auth/logout");
  } finally {
    await clearToken(SESSION_COOKIE);
  }
  redirect("/login");
}

// -- Kendi hesabım -------------------------------------------------------------

/** Parolayı değiştirir; API hesabın diğer oturumlarını kapatır. */
export async function changePassword(
  _previous: FormState<null>,
  formData: FormData,
): Promise<FormState<null>> {
  const failed = (error: string) => ({ error, saved: false, values: null });
  const newPassword = formData.get("newPassword");
  if (newPassword !== formData.get("repeatPassword")) {
    return failed("Yeni parola ile tekrarı aynı değil.");
  }
  const body = adminChangePasswordBodySchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword,
  });
  if (!body.success) return failed(body.error.issues[0]?.message ?? describeIssues(body.error));
  try {
    await adminSend("PUT", "/v1/admin/me/password", body.data);
  } catch (error) {
    return failed(messageOf(error));
  }
  refresh();
  return { error: null, saved: true, values: null };
}

/** Hesabın başka bir tarayıcıdaki oturumunu kapatır. */
export async function revokeSession(sessionId: string): Promise<FormState<unknown>> {
  try {
    await adminSend("DELETE", `/v1/admin/me/sessions/${idSchema.parse(sessionId)}`);
  } catch (error) {
    return { error: messageOf(error), saved: false, values: null };
  }
  refresh();
  return { error: null, saved: true, values: null };
}

/** Kurtarma kodlarını yeniler; yeni kodlar formda bir kez gösterilir. */
export async function regenerateRecoveryCodes(
  _previous: FormState<RevealedSecret>,
  formData: FormData,
): Promise<FormState<RevealedSecret>> {
  const failed = (error: string) => ({ error, saved: false, values: { secrets: [] } });
  const body = adminTotpConfirmBodySchema.safeParse({
    code: text(formData, "code").replaceAll(" ", ""),
  });
  if (!body.success) return failed("Uygulamadaki 6 haneli kodu yaz.");
  try {
    const result = await adminCall(
      adminRecoveryCodesSchema,
      "POST",
      "/v1/admin/me/recovery-codes",
      body.data,
    );
    return { error: null, saved: true, values: { secrets: result.recoveryCodes } };
  } catch (error) {
    return failed(messageOf(error));
  }
}

// -- Hesap yönetimi ------------------------------------------------------------

const accountPath = (accountId: string) => `/v1/admin/accounts/${idSchema.parse(accountId)}`;

/** Yeni panel hesabı açar; geçici parola formda bir kez gösterilir. */
export async function createAccount(
  _previous: FormState<AccountFormValues>,
  formData: FormData,
): Promise<FormState<AccountFormValues>> {
  const values: AccountFormValues = {
    username: text(formData, "username"),
    displayName: text(formData, "displayName"),
    role: text(formData, "role"),
    temporaryPassword: null,
  };
  const failed = (error: string) => ({ error, saved: false, values });
  const body = adminCreateAccountBodySchema.safeParse(values);
  if (!body.success) return failed(describeIssues(body.error));
  try {
    const created = await adminCall(
      adminTemporaryPasswordSchema,
      "POST",
      "/v1/admin/accounts",
      body.data,
    );
    refresh();
    return {
      error: null,
      saved: true,
      values: { ...values, temporaryPassword: created.temporaryPassword },
    };
  } catch (error) {
    return failed(messageOf(error));
  }
}

/** Rolü ya da durumu değiştirir; API hesabın açık oturumlarını kapatır. */
export async function updateAccount(
  accountId: string,
  change: AdminUpdateAccountBody,
): Promise<FormState<unknown>> {
  try {
    await adminCall(adminAccountSchema, "PATCH", accountPath(accountId), change);
  } catch (error) {
    return { error: messageOf(error), saved: false, values: null };
  }
  refresh();
  return { error: null, saved: true, values: null };
}

/** Rol seçim formundan gelen rolü uygular. */
export async function changeRole(
  accountId: string,
  _previous: FormState<unknown>,
  formData: FormData,
): Promise<FormState<unknown>> {
  const role = adminRoleSchema.safeParse(formData.get("role"));
  if (!role.success) return { error: "Bir rol seç.", saved: false, values: null };
  const body: AdminUpdateAccountBody = { role: role.data satisfies AdminRole };
  return updateAccount(accountId, body);
}

/** Parolayı sıfırlar; geçici parola formda bir kez gösterilir. */
export async function resetAccountPassword(
  accountId: string,
  _previous: FormState<RevealedSecret>,
): Promise<FormState<RevealedSecret>> {
  try {
    const reset = await adminCall(
      adminTemporaryPasswordSchema,
      "POST",
      `${accountPath(accountId)}/password-reset`,
    );
    refresh();
    return { error: null, saved: true, values: { secrets: [reset.temporaryPassword] } };
  } catch (error) {
    return { error: messageOf(error), saved: false, values: { secrets: [] } };
  }
}

export async function resetAccountTotp(accountId: string): Promise<FormState<unknown>> {
  try {
    await adminCall(adminAccountSchema, "POST", `${accountPath(accountId)}/totp-reset`);
  } catch (error) {
    return { error: messageOf(error), saved: false, values: null };
  }
  refresh();
  return { error: null, saved: true, values: null };
}

// -- Kullanıcılar, işletmeler, şikayetler -------------------------------------

export async function setUserStatus(
  userId: string,
  status: AdminUpdateUserBody["status"],
): Promise<void> {
  const body: AdminUpdateUserBody = { status };
  await adminSend("PATCH", `/v1/admin/users/${idSchema.parse(userId)}`, body);
  refresh();
}

export async function updateBusiness(
  businessId: string,
  change: AdminUpdateBusinessBody,
): Promise<void> {
  await adminSend("PATCH", `/v1/admin/businesses/${idSchema.parse(businessId)}`, change);
  refresh();
}

export async function setReportStatus(reportId: string, status: ReportStatus): Promise<void> {
  await adminSend("PATCH", `/v1/admin/reports/${idSchema.parse(reportId)}`, { status });
  refresh();
}

// -- Paketler -----------------------------------------------------------------

/** Paketin kimlik kaydını oluşturur veya günceller. Yeni kayıttan sonra paketin sayfası açılır. */
export async function savePackage(
  mode: "create" | "edit",
  _previous: FormState<PackageFormValues>,
  formData: FormData,
): Promise<FormState<PackageFormValues>> {
  const values: PackageFormValues = {
    id: text(formData, "id"),
    name: text(formData, "name"),
    developerName: text(formData, "developerName"),
  };
  const failed = (error: string) => ({ error, saved: false, values });

  const id = packageIdSchema.safeParse(values.id);
  if (!id.success) return failed(ID_RULE);
  const body = adminSavePackageBodySchema.safeParse(values);
  if (!body.success) return failed(describeIssues(body.error));

  try {
    await adminSend("PUT", packagePath(id.data), body.data);
  } catch (error) {
    return failed(messageOf(error));
  }
  if (mode === "create") redirect(`/packages/${id.data}`);
  refresh();
  return { error: null, saved: true, values };
}

/**
 * Seçilen zip dosyasını paketin yeni sürümü olarak yükler. Paket kurallara uymuyorsa API'nin
 * bulduğu sorunlar forma taşınır; yüklenirse sürümün sayfası açılır.
 */
export async function uploadVersion(
  packageId: string,
  _previous: FormState<null>,
  formData: FormData,
): Promise<FormState<null>> {
  const failed = (error: string, problems: string[] = []) => ({
    error,
    problems,
    saved: false,
    values: null,
  });

  const file = formData.get(PACKAGE_UPLOAD_FIELD);
  if (!(file instanceof File) || file.size === 0) return failed("Yüklenecek zip dosyasını seç.");
  const { packageMaxBytes } = (await getOverview()).config;
  if (file.size > packageMaxBytes) {
    return failed(packageTooLargeMessage(packageMaxBytes));
  }

  const body = new FormData();
  body.append(PACKAGE_UPLOAD_FIELD, file, "paket.zip");
  let version: string;
  try {
    const uploaded = await adminCall(
      adminPackageVersionSchema,
      "POST",
      `${packagePath(packageId)}/versions`,
      body,
    );
    version = uploaded.version;
  } catch (error) {
    if (!(error instanceof AdminApiError)) throw error;
    return failed(error.message, describePackageProblems(error.details));
  }
  redirect(`/packages/${packageId}/${version}`);
}

/** Taslağı incelemeye gönderir ya da karara bağlanmamış sürümden vazgeçer. */
export async function moveVersion(
  packageId: string,
  version: string,
  step: "submit" | "withdraw",
): Promise<FormState<null>> {
  try {
    await adminSend("POST", `${versionPath(packageId, version)}/${step}`);
  } catch (error) {
    return { error: messageOf(error), saved: false, values: null };
  }
  refresh();
  return { error: null, saved: true, values: null };
}

/**
 * İnceleme kararı: onay (not isteğe bağlı), ret (gerekçe zorunlu) ya da onaylı sürümü geri çekme.
 * Geri çekmede istenirse sürümü yayınlayan kayıtlar önceki yayınlarına döndürülür.
 */
export async function decideVersion(
  packageId: string,
  version: string,
  decision: "approve" | "reject" | "revoke",
  _previous: FormState<NoteFormValues>,
  formData: FormData,
): Promise<FormState<NoteFormValues>> {
  const values: NoteFormValues = { note: text(formData, "note") };
  const failed = (error: string) => ({ error, saved: false, values });

  const schema = decision === "approve" ? adminApproveBodySchema : adminReviewBodySchema;
  const body = schema.safeParse(values.note === "" ? {} : values);
  if (!body.success) return failed("Gerekçe en az 3, en çok 500 karakter olmalı.");
  const rollback = decision === "revoke" && formData.get("rollback") === "on";

  try {
    await adminSend(
      "POST",
      `${versionPath(packageId, version)}/${decision}`,
      decision === "revoke" ? { ...body.data, rollback } : body.data,
    );
  } catch (error) {
    return failed(messageOf(error));
  }
  refresh();
  return { error: null, saved: true, values: EMPTY_NOTE };
}

/** Onaylı sürümü, paketin daha eski sürümlerini yayınlayan bütün kayıtlara dağıtır. */
export async function rolloutVersion(
  packageId: string,
  version: string,
): Promise<FormState<{ published: number } | null>> {
  try {
    const result = await adminCall(
      adminRolloutResultSchema,
      "POST",
      `${versionPath(packageId, version)}/rollout`,
    );
    refresh();
    return {
      error: null,
      saved: true,
      values: { published: result.published.length },
      problems: result.skipped.map(
        ({ name, problems }) =>
          `${name}: ${problems.map(({ key, message }) => `${key}: ${message}`).join("; ")}`,
      ),
    };
  } catch (error) {
    return { error: messageOf(error), saved: false, values: null };
  }
}

// -- Uygulama kayıtları -------------------------------------------------------

export async function updateMiniApp(
  miniAppId: string,
  change: AdminUpdateMiniAppBody,
): Promise<void> {
  await adminSend("PATCH", miniAppPath(miniAppId), change);
  refresh();
}

/**
 * Uygulama kaydının vitrinini oluşturur veya günceller. `development` türündeki kayıt,
 * geliştiricinin kendi sunucusundan açılır ve yalnızca geliştirme ortamında kabul edilir.
 * Yeni kayıttan sonra kaydın sayfası açılır.
 */
export async function saveMiniApp(
  mode: "create" | "edit",
  kind: "showcase" | "development",
  _previous: FormState<MiniAppFormValues>,
  formData: FormData,
): Promise<FormState<MiniAppFormValues>> {
  const values: MiniAppFormValues = {
    id: text(formData, "id"),
    name: text(formData, "name"),
    description: text(formData, "description"),
    iconUrl: text(formData, "iconUrl"),
    category: text(formData, "category"),
    developerName: text(formData, "developerName"),
    sortOrder: text(formData, "sortOrder"),
    entryUrl: text(formData, "entryUrl"),
    allowedOrigins: text(formData, "allowedOrigins"),
    capabilities: formData.getAll("capabilities").map(String),
    version: text(formData, "version"),
  };
  const failed = (error: string) => ({ error, saved: false, values });

  const id = miniAppIdSchema.safeParse(values.id);
  if (!id.success) return failed(ID_RULE);
  const body = adminSaveMiniAppBodySchema.safeParse({
    name: values.name,
    description: values.description,
    iconUrl: values.iconUrl === "" ? null : values.iconUrl,
    category: values.category,
    developerName: values.developerName,
    sortOrder: values.sortOrder === "" ? undefined : Number(values.sortOrder),
    ...(kind === "development"
      ? {
          development: {
            entryUrl: values.entryUrl,
            allowedOrigins: values.allowedOrigins
              .split("\n")
              .map((origin) => origin.trim())
              .filter((origin) => origin !== ""),
            capabilities: values.capabilities,
            version: values.version,
          },
        }
      : {}),
  });
  if (!body.success) return failed(describeIssues(body.error));

  try {
    await adminSend("PUT", miniAppPath(id.data), body.data);
  } catch (error) {
    return failed(messageOf(error));
  }
  if (mode === "create") redirect(`/miniapps/${id.data}`);
  refresh();
  return { error: null, saved: true, values };
}

/**
 * Onaylı bir paket sürümünü kayıtta, formdaki ayarlarla yayınlar. Ayarlar sürümün beklediği
 * alanlarla eşleşmiyorsa hiçbir şey değişmez ve sorunlar alan adlarıyla gösterilir.
 */
export async function publishRelease(
  miniAppId: string,
  target: { packageId: string; version: string },
  _previous: FormState<ConfigFormValues>,
  formData: FormData,
): Promise<FormState<ConfigFormValues>> {
  const { configFields } = await adminGet(
    adminPackageVersionSchema,
    versionPath(target.packageId, target.version),
  );
  const values = readConfigFormValues(configFields, formData);

  try {
    await adminSend("POST", `${miniAppPath(miniAppId)}/releases`, {
      packageId: target.packageId,
      version: target.version,
      config: toConfigInput(configFields, values),
    });
  } catch (error) {
    if (!(error instanceof AdminApiError)) throw error;
    const problems = describeConfigProblems(configFields, error.details);
    return { error: error.message, problems, saved: false, values };
  }
  redirect(`/miniapps/${miniAppId}`);
}

/** Yayındaki sürümün bildirdiği alanlara göre işletme ayarlarını kaydeder. */
export async function saveConfig(
  miniAppId: string,
  _previous: FormState<ConfigFormValues>,
  formData: FormData,
): Promise<FormState<ConfigFormValues>> {
  const miniApp = await adminGet(adminMiniAppSchema, miniAppPath(miniAppId));
  const fields = miniApp.release?.configFields ?? [];
  const values = readConfigFormValues(fields, formData);

  try {
    await adminSend("PUT", `${miniAppPath(miniAppId)}/config`, {
      config: toConfigInput(fields, values),
    });
  } catch (error) {
    if (!(error instanceof AdminApiError)) throw error;
    const problems = describeConfigProblems(fields, error.details);
    return { error: error.message, problems, saved: false, values };
  }
  refresh();
  return { error: null, saved: true, values };
}

/** Geliştirme kaydının serbest ayarlarını (JSON) kaydeder. */
export async function saveDevelopmentConfig(
  miniAppId: string,
  _previous: FormState<{ json: string }>,
  formData: FormData,
): Promise<FormState<{ json: string }>> {
  const values = { json: text(formData, "json") };
  const failed = (error: string) => ({ error, saved: false, values });

  let parsed: unknown;
  try {
    parsed = JSON.parse(values.json === "" ? "{}" : values.json);
  } catch {
    return failed("Ayarlar geçerli bir JSON değil.");
  }
  const config = configValuesSchema.safeParse(parsed);
  if (!config.success) {
    return failed(
      "Ayarlar bir JSON nesnesi olmalı; değerler metin, sayı ya da true/false olabilir.",
    );
  }

  try {
    await adminSend("PUT", `${miniAppPath(miniAppId)}/config`, { config: config.data });
  } catch (error) {
    return failed(messageOf(error));
  }
  refresh();
  return { error: null, saved: true, values };
}

/** Son yayını geri alır: kayıt bir önceki yayınına, o yayının ayarlarıyla döner. */
export async function rollbackMiniApp(miniAppId: string): Promise<FormState<null>> {
  try {
    await adminSend("POST", `${miniAppPath(miniAppId)}/rollback`);
  } catch (error) {
    return { error: messageOf(error), saved: false, values: null };
  }
  refresh();
  return { error: null, saved: true, values: null };
}

/** Satıcıyı mini uygulamaya bağlar; bağlı olmayan satıcı adına ödeme alınamaz. */
export async function saveMerchant(
  miniAppId: string,
  _previous: FormState<MerchantFormValues>,
  formData: FormData,
): Promise<FormState<MerchantFormValues>> {
  const values: MerchantFormValues = {
    merchantId: text(formData, "merchantId"),
    displayName: text(formData, "displayName"),
    businessId: text(formData, "businessId"),
  };
  const failed = (error: string) => ({ error, saved: false, values });

  const merchantId = merchantIdSchema.safeParse(values.merchantId);
  if (!merchantId.success) {
    return failed("Satıcı kimliği yalnızca küçük harf, rakam ve tire içerebilir.");
  }
  const body = adminSaveMerchantBodySchema.safeParse({
    displayName: values.displayName,
    businessId: values.businessId === "" ? null : values.businessId,
  });
  if (!body.success) return failed(describeIssues(body.error));

  try {
    await adminSend("PUT", `${miniAppPath(miniAppId)}/merchants/${merchantId.data}`, body.data);
  } catch (error) {
    return failed(messageOf(error));
  }
  refresh();
  return { error: null, saved: true, values: EMPTY_MERCHANT };
}

export async function setMerchantActive(
  miniAppId: string,
  merchant: MerchantBinding,
  active: boolean,
): Promise<void> {
  const path = `${miniAppPath(miniAppId)}/merchants/${merchantIdSchema.parse(merchant.merchantId)}`;
  await adminSend("PUT", path, {
    displayName: merchant.displayName,
    businessId: merchant.businessId,
    active,
  });
  refresh();
}
