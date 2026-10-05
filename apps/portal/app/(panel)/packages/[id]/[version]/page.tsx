import {
  type AdminMe,
  type AdminPackageVersion,
  adminPackageVersionSchema,
  type AdminPermission,
  CAPABILITY_LABELS,
  type ConfigField,
  packageIdSchema,
  versionSchema,
} from "@vado/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ActionForm } from "@/components/action-form";
import { DecisionForm } from "@/components/decision-form";
import { PageHeader } from "@/components/page-header";
import { Tag } from "@/components/tag";
import { moveVersion, rolloutVersion } from "@/lib/actions";
import { AdminApiError, adminGet, getMe } from "@/lib/api";
import {
  FINDING_LEVELS,
  formatBytes,
  formatDateTime,
  packageStatus,
  shortDigest,
} from "@/lib/format";

export const metadata: Metadata = { title: "Paket sürümü" };

const CONFIG_TYPE_LABELS: Record<ConfigField["type"], string> = {
  text: "Metin",
  number: "Sayı",
  boolean: "Evet / hayır",
  select: "Seçenek",
};

async function loadVersion(id: string, version: string): Promise<AdminPackageVersion> {
  if (!packageIdSchema.safeParse(id).success || !versionSchema.safeParse(version).success) {
    notFound();
  }
  try {
    return await adminGet(
      adminPackageVersionSchema,
      `/v1/admin/packages/${id}/versions/${version}`,
    );
  } catch (error) {
    const missing = ["package_not_found", "package_version_not_found"];
    if (error instanceof AdminApiError && missing.includes(error.code)) notFound();
    throw error;
  }
}

const fileHref = (id: string, version: string, path: string) =>
  `/packages/${id}/${version}/files/${path.split("/").map(encodeURIComponent).join("/")}` as const;

/** Bir listenin önceki onaylı sürüme göre eklenen ve çıkarılan öğeleriyle gösterimi. */
function ChangeList({
  items,
  added,
  removed,
  label,
  empty,
}: {
  items: readonly string[];
  added: readonly string[];
  removed: readonly string[];
  label: (item: string) => string;
  empty: string;
}) {
  if (items.length === 0 && removed.length === 0) return <p className="muted">{empty}</p>;
  return (
    <ul className="change-list">
      {items.map((item) => (
        <li key={item}>
          <span>
            {label(item)}
            {label(item) !== item && <span className="cell-sub mono">{item}</span>}
          </span>
          {added.includes(item) && <Tag label="Yeni" tone="warning" />}
        </li>
      ))}
      {removed.map((item) => (
        <li key={item} className="removed">
          <span>{label(item)}</span>
          <Tag label="Kaldırıldı" tone="neutral" />
        </li>
      ))}
    </ul>
  );
}

const NOTHING_TO_DO = <p className="muted">Bu sürüm için rolünün yapabileceği bir işlem yok.</p>;

/**
 * Sürümün durumuna ve hesabın iznine göre yapılabilecek kararlar. Düğmeyi gizlemek yetki değildir:
 * her işlemi API ayrıca denetler; burada yalnızca yapılamayacak işlem gösterilmez.
 */
function Decisions({ item, me }: { item: AdminPackageVersion; me: AdminMe }) {
  const { packageId, version, status } = item;
  const can = (permission: AdminPermission) => me.permissions.includes(permission);
  const withdraw = can("packages.upload") && (
    <ActionForm
      action={moveVersion.bind(null, packageId, version, "withdraw")}
      label="Bu sürümden vazgeç"
      confirm={`${version} sürümünden vazgeçilsin mi? Sürüm numarası yeniden kullanılamaz.`}
      saved="Sürümden vazgeçildi."
    />
  );

  if (status === "draft") {
    if (!can("packages.upload")) return NOTHING_TO_DO;
    return (
      <div className="decisions">
        <ActionForm
          action={moveVersion.bind(null, packageId, version, "submit")}
          label="İncelemeye gönder"
          variant="primary"
          saved="İncelemeye gönderildi."
        />
        {withdraw}
      </div>
    );
  }
  if (status === "in_review") {
    // Dört göz ilkesi: yükleyen ya da gönderen onaylayamaz (API ve veritabanı da reddeder).
    const ownVersion = [item.uploadedBy.id, item.submittedBy?.id].includes(me.account.id);
    if (item.submittedBy === null) {
      return (
        <>
          <p className="notice">
            Bu sürüm 2.4'ten önce incelemeye gönderildi; gönderen bilinmiyor. Onaylanabilmesi için
            önce bir hesabın onu yeniden incelemeye göndermesi, sonra başka bir hesabın onaylaması
            gerekir.
          </p>
          <div className="decisions">
            {can("packages.upload") && (
              <ActionForm
                action={moveVersion.bind(null, packageId, version, "submit")}
                label="Yeniden incelemeye gönder"
                variant="primary"
                saved="Gönderildi; onayı başka bir hesap verir."
              />
            )}
            {can("packages.review") && (
              <DecisionForm packageId={packageId} version={version} decision="reject" />
            )}
          </div>
          {withdraw}
        </>
      );
    }
    return (
      <>
        {can("packages.review") && ownVersion && (
          <p className="notice">
            Bu sürümü sen yükledin ya da incelemeye gönderdin; onayı başka bir hesap verir.
          </p>
        )}
        {can("packages.review") && (
          <div className="decisions">
            {!ownVersion && (
              <DecisionForm packageId={packageId} version={version} decision="approve" />
            )}
            <DecisionForm packageId={packageId} version={version} decision="reject" />
          </div>
        )}
        {withdraw}
        {!can("packages.review") && !can("packages.upload") && NOTHING_TO_DO}
      </>
    );
  }
  if (status === "approved") {
    if (!can("packages.rollout") && !can("emergency.disable")) return NOTHING_TO_DO;
    return (
      <div className="decisions">
        {can("packages.rollout") && (
          <div className="decision">
            <h3>Dağıt</h3>
            <p className="hint">
              Paketin daha eski bir sürümünü yayınlayan bütün kayıtlar bu sürüme geçirilir. Ayarları
              bu sürümün alanlarıyla eşleşmeyen kayıtlar atlanır ve listelenir.
            </p>
            <ActionForm
              action={rolloutVersion.bind(null, packageId, version)}
              label="Eski sürümdeki kayıtlara dağıt"
              confirm={`${version} sürümü, eski sürümdeki bütün kayıtlarda yayınlansın mı?`}
              saved="Dağıtım tamamlandı; atlanan kayıt varsa aşağıda listelenir."
            />
          </div>
        )}
        {can("emergency.disable") && (
          <DecisionForm packageId={packageId} version={version} decision="revoke" />
        )}
      </div>
    );
  }
  return (
    <p className="muted">
      Bu sürüm kapandı ve yayınlanamaz. Değişiklik, yeni bir sürüm numarasıyla yüklenir.
    </p>
  );
}

export default async function PackageVersionPage({
  params,
}: PageProps<"/packages/[id]/[version]">) {
  const { id, version } = await params;
  const [item, me] = await Promise.all([loadVersion(id, version), getMe()]);
  const { diff } = item;
  const status = packageStatus(item.status);

  return (
    <>
      <Link href={`/packages/${item.packageId}`} className="back-link">
        {item.name}
      </Link>
      <PageHeader title={`${item.name} ${item.version}`}>
        <Tag {...status} />
      </PageHeader>

      {item.reviewNote !== null && item.status !== "approved" && (
        <p className="notice">
          {status.label}: {item.reviewNote}
        </p>
      )}

      <section aria-labelledby="decision-title">
        <h2 id="decision-title">Karar</h2>
        <Decisions item={item} me={me} />
      </section>

      <section aria-labelledby="access-title">
        <h2 id="access-title">Yetkiler ve bağlantılar</h2>
        <div className="panel split">
          <div>
            <h3>Kabuktan istediği yetkiler</h3>
            <ChangeList
              items={item.permissions}
              added={diff?.permissions.added ?? []}
              removed={diff?.permissions.removed ?? []}
              label={(permission) =>
                Object.hasOwn(CAPABILITY_LABELS, permission)
                  ? CAPABILITY_LABELS[permission as keyof typeof CAPABILITY_LABELS]
                  : permission
              }
              empty="Paket hiçbir yetki istemiyor."
            />
          </div>
          <div>
            <h3>Bağlanabileceği adresler</h3>
            <ChangeList
              items={item.network}
              added={diff?.network.added ?? []}
              removed={diff?.network.removed ?? []}
              label={(origin) => origin}
              empty="Paket kendi dosyaları dışında hiçbir adrese bağlanamaz."
            />
          </div>
        </div>
      </section>

      <section aria-labelledby="diff-title">
        <h2 id="diff-title">Önceki onaylı sürüme göre değişiklikler</h2>
        {diff === null ? (
          <p className="panel empty">
            Karşılaştırılacak daha eski bir onaylı sürüm yok: paketin tamamı ilk kez inceleniyor.
          </p>
        ) : (
          <dl className="panel facts">
            <div>
              <dt>Karşılaştırılan sürüm</dt>
              <dd>
                <Link href={`/packages/${item.packageId}/${diff.base}`} className="mono">
                  {diff.base}
                </Link>
              </dd>
            </div>
            <div>
              <dt>Değişen dosyalar</dt>
              <dd>
                <FileNames names={diff.files.changed} empty="Yok" />
              </dd>
            </div>
            <div>
              <dt>Eklenen dosyalar</dt>
              <dd>
                <FileNames names={diff.files.added} empty="Yok" />
              </dd>
            </div>
            <div>
              <dt>Çıkarılan dosyalar</dt>
              <dd>
                <FileNames names={diff.files.removed} empty="Yok" />
              </dd>
            </div>
            <div>
              <dt>Değişmeyen dosya</dt>
              <dd>{diff.files.unchanged}</dd>
            </div>
            <div>
              <dt>Boyut farkı</dt>
              <dd>
                {diff.sizeDelta === 0
                  ? "Aynı"
                  : `${diff.sizeDelta > 0 ? "+" : "−"}${formatBytes(Math.abs(diff.sizeDelta))}`}
              </dd>
            </div>
            <div>
              <dt>Ayar alanları</dt>
              <dd>
                {[
                  ...diff.configFields.added.map((key) => `${key} eklendi`),
                  ...diff.configFields.removed.map((key) => `${key} kaldırıldı`),
                  ...diff.configFields.changed.map((key) => `${key} değişti`),
                ].join(", ") || "Değişmedi"}
              </dd>
            </div>
            <div>
              <dt>Giriş sayfası</dt>
              <dd>{diff.entryChanged ? "Değişti" : "Değişmedi"}</dd>
            </div>
          </dl>
        )}
      </section>

      <section aria-labelledby="findings-title">
        <h2 id="findings-title">Otomatik bulgular</h2>
        <div className="panel">
          {item.findings.length === 0 ? (
            <p className="empty">Otomatik inceleme bir şey bulmadı.</p>
          ) : (
            <ul className="findings">
              {item.findings.map((finding) => (
                <li key={`${finding.code}:${finding.file ?? ""}:${finding.message}`}>
                  <Tag {...FINDING_LEVELS[finding.level]} />
                  <span>
                    {finding.message}
                    {finding.file !== null && <span className="cell-sub mono">{finding.file}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="pager muted">
            Bulgular yol göstericidir. “Engellenir” diye işaretlenenler, gözden kaçsa da çalışma
            anında tarayıcının güvenlik politikasıyla engellenir.
          </p>
        </div>
      </section>

      <section aria-labelledby="summary-title">
        <h2 id="summary-title">Sürüm</h2>
        <dl className="panel facts">
          <div>
            <dt>İçerik özeti (SHA-256)</dt>
            <dd className="mono wrap">{item.digest}</dd>
          </div>
          <div>
            <dt>Boyut</dt>
            <dd>
              {formatBytes(item.sizeBytes)}, {item.fileCount} dosya
            </dd>
          </div>
          <div>
            <dt>Giriş sayfası</dt>
            <dd className="mono">{item.entry}</dd>
          </div>
          <div>
            <dt>Yükleme</dt>
            <dd>
              {formatDateTime(item.createdAt)}
              <span className="note">{item.uploadedBy.name}</span>
            </dd>
          </div>
          <div>
            <dt>İncelemeye gönderme</dt>
            <dd>
              {item.submittedAt === null ? "Gönderilmedi" : formatDateTime(item.submittedAt)}
              {item.submittedAt !== null && (
                <span className="note">
                  {item.submittedBy?.name ?? "Gönderen bilinmiyor (2.4'ten önce gönderildi)"}
                </span>
              )}
            </dd>
          </div>
          <div>
            <dt>Son karar</dt>
            <dd>
              {item.reviewedAt === null || item.reviewedBy === null ? (
                "Karar verilmedi"
              ) : (
                <>
                  {status.label}, {formatDateTime(item.reviewedAt)}
                  <span className="note">
                    {item.reviewedBy.name}
                    {item.reviewNote === null ? "" : `: ${item.reviewNote}`}
                  </span>
                </>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="config-title">
        <h2 id="config-title">İşletmeden beklenen ayarlar</h2>
        <div className="panel table-scroll">
          {item.configFields.length === 0 ? (
            <p className="empty">Bu sürüm işletmeden ayar beklemiyor.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th scope="col">Alan</th>
                  <th scope="col">Tür</th>
                  <th scope="col">Zorunlu</th>
                  <th scope="col">Varsayılan</th>
                </tr>
              </thead>
              <tbody>
                {item.configFields.map((field) => (
                  <tr key={field.key}>
                    <td>
                      <span className="cell-title">{field.label}</span>
                      <span className="cell-sub mono">{field.key}</span>
                    </td>
                    <td>
                      {CONFIG_TYPE_LABELS[field.type]}
                      {field.options !== undefined && (
                        <span className="cell-sub">
                          {field.options.map((option) => option.label).join(", ")}
                        </span>
                      )}
                    </td>
                    <td>{field.required ? "Evet" : "Hayır"}</td>
                    <td className="mono">
                      {field.default === undefined ? "—" : String(field.default)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      <section aria-labelledby="files-title">
        <h2 id="files-title">Dosyalar</h2>
        <div className="panel table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">Dosya</th>
                <th scope="col">Tür</th>
                <th scope="col">Boyut</th>
                <th scope="col">Özet</th>
              </tr>
            </thead>
            <tbody>
              {item.files.map((file) => (
                <tr key={file.path}>
                  <td>
                    <Link href={fileHref(item.packageId, item.version, file.path)} className="mono">
                      {file.path}
                    </Link>
                    {diff?.files.added.includes(file.path) === true && (
                      <Tag label="Yeni" tone="warning" />
                    )}
                    {diff?.files.changed.includes(file.path) === true && (
                      <Tag label="Değişti" tone="warning" />
                    )}
                  </td>
                  <td>{file.contentType.split(";")[0]}</td>
                  <td>{formatBytes(file.size)}</td>
                  <td className="mono">{shortDigest(file.sha256)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="used-title">
        <h2 id="used-title">Bu sürümü yayınlayan kayıtlar</h2>
        <div className="panel">
          {item.usedBy.length === 0 ? (
            <p className="empty">Bu sürümü yayınlayan uygulama kaydı yok.</p>
          ) : (
            <ul className="links">
              {item.usedBy.map((record) => (
                <li key={record.id}>
                  <Link href={`/miniapps/${record.id}`}>{record.name}</Link>
                  <span className="cell-sub mono">{record.id}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </>
  );
}

function FileNames({ names, empty }: { names: readonly string[]; empty: string }) {
  if (names.length === 0) return <span className="muted">{empty}</span>;
  return (
    <span className="mono wrap">
      {names.map((name) => (
        <span key={name} className="file-name">
          {name}
        </span>
      ))}
    </span>
  );
}
