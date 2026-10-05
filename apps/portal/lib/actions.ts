"use server";

import {
  adminApproveBodySchema,
  adminMiniAppSchema,
  adminPackageVersionSchema,
  adminReviewBodySchema,
  adminRolloutResultSchema,
  adminSaveMerchantBodySchema,
  adminSaveMiniAppBodySchema,
  adminSavePackageBodySchema,
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
import type { z } from "zod";

import { AdminApiError, adminCall, adminGet, adminSend, getOverview } from "./api";
import {
  describeConfigProblems,
  describePackageProblems,
  readConfigFormValues,
  toConfigInput,
} from "./config-values";
import {
  type ConfigFormValues,
  EMPTY_MERCHANT,
  EMPTY_NOTE,
  type FormState,
  type MerchantFormValues,
  type MiniAppFormValues,
  type NoteFormValues,
  type PackageFormValues,
} from "./form-state";
import { packageTooLargeMessage } from "./format";

/*
 * Panelin tüm değişiklikleri bu dosyadaki sunucu işlevlerinden geçer. Yetki, her işlevin çağırdığı
 * `adminSend` içinde doğrulanır. İşlevlere bağlanan kimlikler tarayıcıdan geldiği için API yoluna
 * yazılmadan önce burada da biçimce doğrulanır.
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
