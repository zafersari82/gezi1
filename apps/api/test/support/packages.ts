import {
  ADMIN_KEY_HEADER,
  type AdminMiniApp,
  adminMiniAppSchema,
  adminPackageSchema,
  type AdminPackageVersion,
  adminPackageVersionSchema,
  type AdminRole,
  type ApiErrorBody,
  apiErrorBodySchema,
  type ErrorCode,
  PACKAGE_MANIFEST_FILE,
  PACKAGE_UPLOAD_FIELD,
} from "@vado/contracts";
import { expect } from "vitest";

import { writeZip } from "../../src/core/zip";
import { asAdmin, multipartBody, type TestApp, TINY_PNG } from "./harness";

let sequence = 0;
/** Çakışmayan bir paket ya da uygulama kaydı kimliği üretir. */
export const unique = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(sequence += 1)}`;

export interface PackageSource {
  id: string;
  version: string;
  /** Bildirim dosyasına eklenecek ya da üzerine yazılacak alanlar. */
  manifest?: Record<string, unknown>;
  /** Eklenecek ya da değiştirilecek dosyalar; `null` dosyayı paketten çıkarır. */
  files?: Record<string, string | Buffer | null>;
}

const INDEX_HTML = `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="./assets/style.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./assets/app.js"></script>
  </body>
</html>
`;

/** Sınamalarda kullanılan küçük ama eksiksiz bir paketin dosyaları. */
export function packageFiles(source: PackageSource): Record<string, Buffer> {
  const manifest = {
    manifest: 1,
    id: source.id,
    version: source.version,
    name: "Örnek Paket",
    icon: "icon.png",
    ...source.manifest,
  };
  const files: Record<string, string | Buffer | null> = {
    [PACKAGE_MANIFEST_FILE]: JSON.stringify(manifest, null, 2),
    "index.html": INDEX_HTML,
    "assets/app.js": 'document.getElementById("root").textContent = "Merhaba";\n',
    "assets/style.css": "body { margin: 0; }\n",
    "icon.png": TINY_PNG,
    ...source.files,
  };
  return Object.fromEntries(
    Object.entries(files)
      .filter((entry): entry is [string, string | Buffer] => entry[1] !== null)
      .map(([path, data]) => [path, typeof data === "string" ? Buffer.from(data) : data]),
  );
}

export function packageArchive(source: PackageSource): Buffer {
  return writeZip(Object.entries(packageFiles(source)).map(([path, data]) => ({ path, data })));
}

/** Arşivi paketin yeni sürümü olarak yükler (varsayılan: operatör); durum kodunu ve gövdeyi döndürür. */
export async function sendArchive(
  app: TestApp,
  packageId: string,
  archive: Buffer,
  field = PACKAGE_UPLOAD_FIELD,
  role: AdminRole = "operator",
): Promise<{ status: number; body: unknown }> {
  const { payload, headers } = multipartBody(field, "paket.zip", archive);
  const response = await app.server.inject({
    method: "POST",
    url: `/v1/admin/packages/${packageId}/versions`,
    headers: {
      ...headers,
      [ADMIN_KEY_HEADER]: app.config.adminApiKey,
      authorization: `Bearer ${app.admins[role].token}`,
    },
    payload,
  });
  return { status: response.statusCode, body: response.body === "" ? null : response.json() };
}

/** Yüklemenin verilen hata koduyla reddedildiğini doğrular ve hata gövdesini döndürür. */
export async function expectUploadError(
  app: TestApp,
  packageId: string,
  archive: Buffer,
  code: ErrorCode,
): Promise<ApiErrorBody["error"]> {
  const response = await sendArchive(app, packageId, archive);
  const body = apiErrorBodySchema.parse(response.body);
  expect(body.error.code).toBe(code);
  return body.error;
}

/** Paketin kimlik kaydını operatör hesabıyla oluşturur. */
export async function createPackage(app: TestApp, id = unique("paket")): Promise<string> {
  await asAdmin(app, "operator").ok(adminPackageSchema, "PUT", `/v1/admin/packages/${id}`, {
    body: { name: "Örnek Paket", developerName: "VADO" },
  });
  return id;
}

/** Sürümü taslak olarak yükler. */
export async function uploadVersion(
  app: TestApp,
  source: PackageSource,
  role: AdminRole = "operator",
): Promise<AdminPackageVersion> {
  const response = await sendArchive(
    app,
    source.id,
    packageArchive(source),
    PACKAGE_UPLOAD_FIELD,
    role,
  );
  expect(response, `${source.id} ${source.version}`).toMatchObject({ status: 200 });
  return adminPackageVersionSchema.parse(response.body);
}

/** Sürümü operatör yükler ve incelemeye gönderir, inceleyen onaylar. */
export async function approveVersion(
  app: TestApp,
  source: PackageSource,
): Promise<AdminPackageVersion> {
  const url = `/v1/admin/packages/${source.id}/versions/${source.version}`;
  await uploadVersion(app, source);
  await asAdmin(app, "operator").ok(adminPackageVersionSchema, "POST", `${url}/submit`);
  return asAdmin(app, "reviewer").ok(adminPackageVersionSchema, "POST", `${url}/approve`);
}

/** Yeni bir uygulama kaydı açar; kayıt doğrulanmamıştır ve yayınlanmış sürümü yoktur. */
export async function createAppRecord(app: TestApp, id = unique("kayit")): Promise<string> {
  await asAdmin(app).ok(adminMiniAppSchema, "PUT", `/v1/admin/miniapps/${id}`, {
    body: {
      name: "Kadıköy Berber",
      description: "Saç, sakal ve bakım randevuları için örnek kayıt",
      category: "beauty",
      developerName: "VADO",
    },
  });
  return id;
}

/** Onaylı sürümü yeni bir uygulama kaydında yayınlar ve kaydı doğrular. */
export async function publishApp(
  app: TestApp,
  release: { packageId: string; version: string; config?: Record<string, unknown> },
  id = unique("kayit"),
): Promise<AdminMiniApp> {
  const admin = asAdmin(app);
  await createAppRecord(app, id);
  await admin.done("PATCH", `/v1/admin/miniapps/${id}`, { body: { verified: true } });
  return admin.ok(adminMiniAppSchema, "POST", `/v1/admin/miniapps/${id}/releases`, {
    body: release,
  });
}

/** Tek sürümlü onaylı bir paketi yeni bir uygulama kaydında yayınlar. */
export async function publishSample(
  app: TestApp,
  source: Omit<PackageSource, "id" | "version"> & { config?: Record<string, unknown> } = {},
): Promise<{ packageId: string; miniApp: AdminMiniApp }> {
  const packageId = await createPackage(app);
  const { config, ...rest } = source;
  await approveVersion(app, { id: packageId, version: "1.0.0", ...rest });
  const release = { packageId, version: "1.0.0", ...(config === undefined ? {} : { config }) };
  return { packageId, miniApp: await publishApp(app, release) };
}

/** Paket dosyası isteği gönderir; adres, API'nin dış adresiyle ya da bir alan adıyla başlar. */
export async function fetchPackageFile(
  app: TestApp,
  url: string,
  headers: Record<string, string> = {},
  method: "GET" | "HEAD" = "GET",
) {
  const target = new URL(url);
  return app.server.inject({
    method,
    url: `${target.pathname}${target.search}`,
    headers: { host: target.host, ...headers },
  });
}
