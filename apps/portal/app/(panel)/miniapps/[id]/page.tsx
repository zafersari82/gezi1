import {
  adminBusinessSchema,
  type AdminMiniApp,
  adminMiniAppSchema,
  adminPackageSchema,
  type AdminPackageVersion,
  adminPackageVersionSchema,
  CAPABILITY_LABELS,
  listOf,
  MINI_APP_RELEASE_ACTION_LABELS,
  miniAppIdSchema,
  packageIdSchema,
  versionSchema,
} from "@vado/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { ActionForm } from "@/components/action-form";
import { ConfigForm } from "@/components/config-form";
import { DevelopmentConfigForm } from "@/components/development-config-form";
import { MerchantForm } from "@/components/merchant-form";
import { MiniAppForm } from "@/components/mini-app-form";
import { PageHeader } from "@/components/page-header";
import { QrForm } from "@/components/qr-form";
import { SubmitButton } from "@/components/submit-button";
import { Tag } from "@/components/tag";
import {
  publishRelease,
  rollbackMiniApp,
  saveConfig,
  setMerchantActive,
  updateMiniApp,
} from "@/lib/actions";
import { AdminApiError, adminGet, getMe } from "@/lib/api";
import { toConfigFormValues } from "@/lib/config-values";
import type { MiniAppFormValues } from "@/lib/form-state";
import { formatDateTime, miniAppStatus, packageStatus, shortDigest } from "@/lib/format";

export const metadata: Metadata = { title: "Mini uygulama" };

const querySchema = z.object({
  package: packageIdSchema.optional().catch(undefined),
  version: versionSchema.optional().catch(undefined),
});

/** Kaydın kullanıcılara neden kapalı olduğunu ve ne yapılacağını anlatan uyarılar. */
const OFFLINE_NOTICES: Record<NonNullable<AdminMiniApp["offlineReason"]>, string> = {
  disabled: "Bu kayıt kullanıma kapatıldı: listede görünmez, açılamaz ve ödeme alamaz.",
  unverified:
    "Bu kayıt doğrulanmadığı için kullanıcılara görünmüyor. Vitrini ve satıcıyı inceledikten sonra doğrula.",
  unpublished:
    "Bu kayıtta yayınlanmış bir paket sürümü yok. Aşağıdan onaylı bir sürüm seçip yayınla.",
  version_unavailable:
    "Yayındaki sürüm geri çekildi; kayıt kullanıcılara kapalı. Yayını geri al ya da başka bir onaylı sürüm yayınla.",
  url_mode_disabled:
    "Bu kayıt geliştiricinin sunucusundan açılıyor ve bu ortamda çalışmaz. Aşağıdan onaylı bir paket sürümü yayınlandığında, aynı kimlikle ve kullanıcı kimlikleri korunarak açılır.",
};

async function loadMiniApp(id: string): Promise<AdminMiniApp> {
  if (!miniAppIdSchema.safeParse(id).success) notFound();
  try {
    return await adminGet(adminMiniAppSchema, `/v1/admin/miniapps/${id}`);
  } catch (error) {
    if (error instanceof AdminApiError && error.code === "miniapp_not_found") notFound();
    throw error;
  }
}

/** Yayınlanmak üzere seçilen sürüm; seçim geçersizse ya da sürüm onaylı değilse `null`. */
async function loadCandidate(
  packageId: string | undefined,
  version: string | undefined,
): Promise<AdminPackageVersion | null> {
  if (packageId === undefined || version === undefined) return null;
  const candidate = await adminGet(
    adminPackageVersionSchema,
    `/v1/admin/packages/${packageId}/versions/${version}`,
  ).catch((error: unknown) => {
    if (error instanceof AdminApiError) return null;
    throw error;
  });
  return candidate?.status === "approved" ? candidate : null;
}

function toFormValues(miniApp: AdminMiniApp): MiniAppFormValues {
  return {
    id: miniApp.id,
    name: miniApp.name,
    description: miniApp.description,
    iconUrl: miniApp.customIconUrl ?? "",
    category: miniApp.category,
    developerName: miniApp.developerName,
    sortOrder: String(miniApp.sortOrder),
    entryUrl: miniApp.development?.entryUrl ?? "",
    allowedOrigins: (miniApp.development?.allowedOrigins ?? []).join("\n"),
    capabilities: miniApp.source === "url" ? miniApp.capabilities : [],
    version: miniApp.source === "url" ? (miniApp.version ?? "") : "",
  };
}

export default async function MiniAppPage({ params, searchParams }: PageProps<"/miniapps/[id]">) {
  const { id } = await params;
  const query = querySchema.parse(await searchParams);
  const [miniApp, businesses, packages, candidate, me] = await Promise.all([
    loadMiniApp(id),
    adminGet(listOf(adminBusinessSchema), "/v1/admin/businesses"),
    adminGet(listOf(adminPackageSchema), "/v1/admin/packages"),
    loadCandidate(query.package, query.version),
    getMe(),
  ]);
  const activeBusinesses = businesses.items.filter((business) => business.status === "active");
  const businessNames = new Map(businesses.items.map((business) => [business.id, business.name]));
  const { release } = miniApp;

  // Bir kayıt ilk yayınından sonra başka bir pakete geçirilemez; seçenekler buna göre daralır.
  const publishable = packages.items
    .filter((item) => release === null || item.id === release.packageId)
    .flatMap((item) =>
      item.versions
        .filter((version) => version.status === "approved")
        .map((version) => ({ packageName: item.name, ...version })),
    )
    .filter((version) => version.version !== release?.version);

  return (
    <>
      <Link href="/miniapps" className="back-link">
        Mini uygulamalar
      </Link>
      <PageHeader title={miniApp.name}>
        <div className="header-actions">
          {miniApp.verified ? (
            <form action={updateMiniApp.bind(null, miniApp.id, { verified: false })}>
              <SubmitButton
                confirm={`${miniApp.name} kaydının doğrulaması kaldırılsın mı? Kullanıcılara kapanır.`}
              >
                Doğrulamayı kaldır
              </SubmitButton>
            </form>
          ) : (
            <form action={updateMiniApp.bind(null, miniApp.id, { verified: true })}>
              <SubmitButton variant="primary">Kaydı doğrula</SubmitButton>
            </form>
          )}
          {miniApp.enabled ? (
            <form action={updateMiniApp.bind(null, miniApp.id, { enabled: false })}>
              <SubmitButton
                variant="danger"
                confirm={`${miniApp.name} kullanıma kapatılsın mı? Hemen kapanır; QR kodları da çalışmaz.`}
              >
                Kullanıma kapat
              </SubmitButton>
            </form>
          ) : (
            <form action={updateMiniApp.bind(null, miniApp.id, { enabled: true })}>
              <SubmitButton>Kullanıma aç</SubmitButton>
            </form>
          )}
        </div>
      </PageHeader>

      <p className="status-line">
        <Tag {...miniAppStatus(miniApp.offlineReason)} />
        {miniApp.source === "url" && <Tag label="Geliştirme kaydı" tone="neutral" />}
      </p>
      {miniApp.offlineReason !== null && (
        <p className="notice">{OFFLINE_NOTICES[miniApp.offlineReason]}</p>
      )}

      <section aria-labelledby="release-title">
        <h2 id="release-title">Yayın</h2>
        <div className="panel">
          {release === null ? (
            <p className="empty">
              {miniApp.source === "url"
                ? `Kod, geliştirme sunucusundan açılıyor: ${miniApp.development?.entryUrl ?? ""}`
                : "Henüz bir paket sürümü yayınlanmadı."}
            </p>
          ) : (
            <dl className="facts">
              <div>
                <dt>Yayındaki sürüm</dt>
                <dd>
                  <Link href={`/packages/${release.packageId}/${release.version}`}>
                    {release.packageName} <span className="mono">{release.version}</span>
                  </Link>{" "}
                  <Tag {...packageStatus(release.status)} />
                  <span className="note mono">özet {shortDigest(release.digest)}</span>
                </dd>
              </div>
              <div>
                <dt>Yetkiler</dt>
                <dd>
                  {miniApp.capabilities.length === 0
                    ? "Yok"
                    : miniApp.capabilities.map((item) => CAPABILITY_LABELS[item]).join(", ")}
                </dd>
              </div>
              <div>
                <dt>Bağlanabileceği adresler</dt>
                <dd className="mono wrap">
                  {release.network.length === 0 ? "Yok" : release.network.join(", ")}
                </dd>
              </div>
            </dl>
          )}

          {candidate !== null && (
            <div className="candidate">
              <h3>
                {candidate.name} <span className="mono">{candidate.version}</span> yayınlanacak
              </h3>
              <p className="hint">
                Ayarlar bu sürümün beklediği alanlara göre doldurulur. Yayınla dediğinde kayıt hemen
                bu sürüme geçer.
              </p>
              <ConfigForm
                key={`${candidate.packageId}@${candidate.version}`}
                action={publishRelease.bind(null, miniApp.id, {
                  packageId: candidate.packageId,
                  version: candidate.version,
                })}
                fields={candidate.configFields}
                current={toConfigFormValues(candidate.configFields, miniApp.config)}
                submitLabel={`${candidate.version} sürümünü yayınla`}
                saved="Yayınlandı."
              />
              <Link href={`/miniapps/${miniApp.id}`} className="button">
                Vazgeç
              </Link>
            </div>
          )}

          {candidate === null && publishable.length > 0 && (
            <div className="table-scroll bordered">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Yayınlanabilecek onaylı sürümler</th>
                    <th scope="col">Onay</th>
                    <th scope="col">
                      <span className="visually-hidden">İşlem</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {publishable.map((version) => (
                    <tr key={`${version.packageId}@${version.version}`}>
                      <td>
                        <Link href={`/packages/${version.packageId}/${version.version}`}>
                          {version.packageName} <span className="mono">{version.version}</span>
                        </Link>
                      </td>
                      <td>
                        {version.reviewedAt === null ? "—" : formatDateTime(version.reviewedAt)}
                      </td>
                      <td className="actions">
                        <Link
                          href={`/miniapps/${miniApp.id}?package=${version.packageId}&version=${version.version}`}
                          className="button"
                        >
                          Bu sürümü yayınla
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {candidate === null && publishable.length === 0 && (
            <p className="pager muted">
              Yayınlanabilecek başka bir onaylı sürüm yok. Sürümler{" "}
              <Link href="/packages">Paketler</Link> bölümünden yüklenir ve onaylanır.
            </p>
          )}
        </div>
      </section>

      <section aria-labelledby="config-title">
        <h2 id="config-title">İşletme ayarları</h2>
        <div className="panel">
          {release !== null ? (
            <ConfigForm
              action={saveConfig.bind(null, miniApp.id)}
              fields={release.configFields}
              current={toConfigFormValues(release.configFields, miniApp.config)}
              submitLabel="Ayarları kaydet"
              saved="Kaydedildi."
            />
          ) : miniApp.source === "url" ? (
            <DevelopmentConfigForm
              miniAppId={miniApp.id}
              json={JSON.stringify(miniApp.config, null, 2)}
            />
          ) : (
            <p className="empty">
              Ayar alanlarını yayınlanan sürüm belirler; önce bir sürüm yayınla.
            </p>
          )}
        </div>
      </section>

      {miniApp.releases.length > 0 && (
        <section aria-labelledby="history-title">
          <h2 id="history-title">Yayın geçmişi</h2>
          <div className="panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Zaman</th>
                    <th scope="col">İşlem</th>
                    <th scope="col">Sürüm</th>
                    <th scope="col">Yapan</th>
                  </tr>
                </thead>
                <tbody>
                  {miniApp.releases.map((entry) => (
                    <tr key={entry.seq}>
                      <td>{formatDateTime(entry.createdAt)}</td>
                      <td>{MINI_APP_RELEASE_ACTION_LABELS[entry.action]}</td>
                      <td className="mono">{entry.version}</td>
                      <td>{entry.actor.name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <ActionForm
                action={rollbackMiniApp.bind(null, miniApp.id)}
                label="Son yayını geri al"
                confirm={`${miniApp.name} bir önceki yayınına döndürülsün mü?`}
                saved="Önceki yayına dönüldü."
              />
            </div>
          </div>
        </section>
      )}

      <section aria-labelledby="record-title">
        <h2 id="record-title">Vitrin</h2>
        <MiniAppForm
          mode="edit"
          kind={miniApp.source === "url" ? "development" : "showcase"}
          initial={toFormValues(miniApp)}
        />
      </section>

      {me.permissions.includes("miniapps.manage") && (
        <section aria-labelledby="qr-title">
          <h2 id="qr-title">QR kodu</h2>
          <div className="panel">
            <p className="muted qr-intro">
              Okutulduğunda bu mini uygulamayı açar. Masa ya da şube gibi parametreler kodun
              imzasındadır; mini uygulama onları değiştirilmemiş olarak okur.
            </p>
            <QrForm miniAppId={miniApp.id} />
          </div>
        </section>
      )}

      <section aria-labelledby="merchants-title">
        <h2 id="merchants-title">Ödeme alabilen satıcılar</h2>
        <div className="panel">
          {miniApp.merchants.length === 0 ? (
            <p className="empty">
              Bağlı satıcı yok. Bu mini uygulama, satıcı bağlanana kadar ödeme alamaz.
            </p>
          ) : (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Satıcı</th>
                    <th scope="col">İşletme</th>
                    <th scope="col">Durum</th>
                    <th scope="col">
                      <span className="visually-hidden">İşlem</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {miniApp.merchants.map((merchant) => (
                    <tr key={merchant.merchantId}>
                      <td>
                        <span className="cell-title">{merchant.displayName}</span>
                        <span className="cell-sub mono">{merchant.merchantId}</span>
                      </td>
                      <td>
                        {merchant.businessId === null
                          ? "Bağlı işletme yok"
                          : (businessNames.get(merchant.businessId) ?? "Silinmiş işletme")}
                      </td>
                      <td>
                        {merchant.active ? (
                          <Tag label="Ödeme alabilir" tone="positive" />
                        ) : (
                          <Tag label="Durduruldu" tone="danger" />
                        )}
                      </td>
                      <td className="actions">
                        <form
                          action={setMerchantActive.bind(
                            null,
                            miniApp.id,
                            merchant,
                            !merchant.active,
                          )}
                        >
                          <SubmitButton variant={merchant.active ? "danger" : "default"}>
                            {merchant.active ? "Ödemeyi durdur" : "Ödemeyi aç"}
                          </SubmitButton>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <MerchantForm
            miniAppId={miniApp.id}
            businesses={activeBusinesses.map(({ id: businessId, name }) => ({
              id: businessId,
              name,
            }))}
          />
        </div>
      </section>
    </>
  );
}
