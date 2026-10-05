import {
  type AdminPackage,
  type AdminPackageVersion,
  type AdminRevokeBody,
  type AdminSavePackageBody,
  compareVersions,
  PACKAGE_MANIFEST_FILE,
  packageDigestInput,
  type PackageFileContent,
  type PackageVersionStatus,
} from "@vado/contracts";

import { recordAudit } from "../../core/audit";
import type { AppContext } from "../../core/context";
import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { sha256 } from "../../core/security";
import { PackageStoreError } from "../../providers/package-store";
import type { MiniAppAdminService } from "../miniapps/miniapp-admin.service";
import { inspectPackage } from "./package-inspection";
import {
  diffVersions,
  PACKAGE_VERSION_COLUMNS,
  type PackageFileRow,
  type PackageVersionRow,
  toPackageFile,
  toVersionSummary,
} from "./package-rows";

const LIST_LIMIT = 200;
const USED_BY_SHOWN = 200;
/** İnceleme ekranında metin olarak gösterilecek en büyük dosya. */
const TEXT_VIEW_MAX_BYTES = 512 * 1024;
const TEXT_TYPES = ["text/", "application/json", "image/svg+xml"];

interface PackageRow {
  id: string;
  name: string;
  developer_name: string;
  app_count: number;
  created_at: Date;
}

/** Bir durum geçişi: hangi durumlardan hangisine, denetim kaydına hangi adla. */
interface Transition {
  from: PackageVersionStatus[];
  to: PackageVersionStatus;
  action: string;
  /** Karar gerekçesi; verilirse inceleme alanlarına yazılır. */
  review?: { note: string | null };
}

/** Depo denetiminde bulunan bir tutarsızlık. `path` boşsa sorun sürümün dosya listesindedir. */
export interface StoreProblem {
  packageId: string;
  version: string;
  status: PackageVersionStatus;
  path: string | null;
  reason: "digest_mismatch" | PackageStoreError["reason"];
}

export interface StoreReport {
  versions: number;
  files: number;
  /** Depodan okunan ayrı içerik sayısı: aynı dosya birçok sürümde yer alabilir. */
  contents: number;
  problems: StoreProblem[];
}

/**
 * Paketlerin yüklenmesi ve incelenmesi.
 *
 * Bir sürüm yüklendiği anda içeriği sabitlenir: dosyalar içerik adresli depoya, dosya listesi ve
 * özeti veritabanına yazılır ve hiçbiri sonradan değiştirilemez. Sürüm yalnızca durum değiştirir:
 * taslak → incelemede → onaylı ya da reddedildi; onaylı bir sürüm gerektiğinde geri çekilir.
 * Değişiklik gerekiyorsa yeni bir sürüm numarasıyla yeniden yüklenir.
 */
export function createPackageService(
  { config, db, log, packageStore }: AppContext,
  { miniAppAdmin }: { miniAppAdmin: MiniAppAdminService },
) {
  async function packages(filter: "all" | { id: string }): Promise<AdminPackage[]> {
    const rows = await db.many<PackageRow>(sql`
      select
        p.id, p.name, p.developer_name, p.created_at,
        (select count(*) from mini_apps a where a.package_id = p.id) as app_count
      from packages p
      where ${filter === "all" ? sql`true` : sql`p.id = ${filter.id}`}
      order by p.name, p.id
      limit ${LIST_LIMIT}
    `);
    const versions = await db.many<PackageVersionRow>(sql`
      select ${PACKAGE_VERSION_COLUMNS}
      from package_versions v
      where v.package_id = any(${rows.map((row) => row.id)}::text[])
      order by v.version_key desc
    `);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      developerName: row.developer_name,
      versions: versions.filter((version) => version.package_id === row.id).map(toVersionSummary),
      appCount: row.app_count,
      createdAt: row.created_at.toISOString(),
    }));
  }

  function list(): Promise<AdminPackage[]> {
    return packages("all");
  }

  async function get(packageId: string): Promise<AdminPackage> {
    const [found] = await packages({ id: packageId });
    if (found === undefined) throw new AppError("package_not_found");
    return found;
  }

  /** Paketin kimlik kaydını oluşturur veya günceller; sürümler bu kaydın altına yüklenir. */
  async function save(
    actor: string,
    packageId: string,
    body: AdminSavePackageBody,
  ): Promise<AdminPackage> {
    await db.transaction(async (tx) => {
      await tx.execute(sql`
        insert into packages (id, name, developer_name)
        values (${packageId}, ${body.name}, ${body.developerName})
        on conflict (id) do update set
          name = excluded.name,
          developer_name = excluded.developer_name,
          updated_at = now()
      `);
      await recordAudit(tx, {
        actor,
        action: "package.saved",
        targetType: "package",
        targetId: packageId,
        metadata: body,
      });
    });
    return get(packageId);
  }

  function findVersion(tx: Database, packageId: string, version: string) {
    return tx.maybeOne<PackageVersionRow>(sql`
      select ${PACKAGE_VERSION_COLUMNS}
      from package_versions v
      where v.package_id = ${packageId} and v.version = ${version}
    `);
  }

  function filesOf(tx: Database, packageId: string, version: string) {
    return tx.many<PackageFileRow>(sql`
      select path, sha256, size, content_type
      from package_files
      where package_id = ${packageId} and version = ${version}
      order by path collate "C"
    `);
  }

  async function getVersion(packageId: string, version: string): Promise<AdminPackageVersion> {
    const row = await findVersion(db, packageId, version);
    if (row === null) throw new AppError("package_version_not_found");
    const files = await filesOf(db, packageId, version);

    // Karşılaştırma, bu sürümden küçük en yeni onaylı sürümle yapılır: yayında olabilecek son hal.
    const base = await db.maybeOne<PackageVersionRow>(sql`
      select ${PACKAGE_VERSION_COLUMNS}
      from package_versions v
      where v.package_id = ${packageId}
        and v.status = 'approved'
        and v.version_key < string_to_array(${version}, '.')::integer[]
      order by v.version_key desc
      limit 1
    `);
    const diff =
      base === null
        ? null
        : diffVersions(
            { version: base, files: await filesOf(db, packageId, base.version) },
            { version: row, files },
          );
    const usedBy = await db.many<{ id: string; name: string }>(sql`
      select id, name from mini_apps
      where package_id = ${packageId} and package_version = ${version}
      order by name, id
      limit ${USED_BY_SHOWN}
    `);

    return {
      ...toVersionSummary(row),
      entry: row.entry,
      icon: row.icon,
      configFields: row.config_fields,
      files: files.map(toPackageFile),
      findings: row.findings,
      diff,
      usedBy,
    };
  }

  /** Depodan içerik okur; içerik yoksa, bozulmuşsa ya da kayıtlı boyutta değilse hata fırlatır. */
  async function loadBlob(file: PackageFileRow): Promise<Buffer> {
    const data = await packageStore.read(file.sha256);
    if (data.length !== file.size) throw new PackageStoreError("corrupt", file.sha256);
    return data;
  }

  /** Depodan içerik okur; içerik yoksa ya da bozulmuşsa kayıt düşer ve hata fırlatır. */
  async function readBlob(packageId: string, version: string, file: PackageFileRow) {
    try {
      return await loadBlob(file);
    } catch (error) {
      if (!(error instanceof PackageStoreError)) throw error;
      log.error(
        { packageId, version, path: file.path, sha256: file.sha256, reason: error.reason },
        "Paket dosyası depoda yok ya da bozulmuş",
      );
      throw new AppError("package_integrity_failed");
    }
  }

  /** İnceleyenin açtığı dosya. Metin olmayan ve çok büyük dosyaların içeriği verilmez. */
  async function readFile(
    packageId: string,
    version: string,
    path: string,
  ): Promise<PackageFileContent> {
    const file = await db.maybeOne<PackageFileRow>(sql`
      select path, sha256, size, content_type
      from package_files
      where package_id = ${packageId} and version = ${version} and path = ${path}
    `);
    if (file === null) throw new AppError("package_version_not_found");

    const viewable =
      file.size <= TEXT_VIEW_MAX_BYTES &&
      TEXT_TYPES.some((type) => file.content_type.startsWith(type));
    const text = viewable ? (await readBlob(packageId, version, file)).toString("utf8") : null;
    return { ...toPackageFile(file), text };
  }

  /**
   * Sürümün dosya listesinin özetiyle, depodaki her dosyanın da kendi özetiyle eşleştiğini
   * doğrular. Sürüm incelemeye gönderilirken ve onaylanırken çağrılır.
   */
  async function verifyIntegrity(row: PackageVersionRow): Promise<void> {
    const files = await filesOf(db, row.package_id, row.version);
    if (sha256(packageDigestInput(files)) !== row.digest) {
      log.error(
        { packageId: row.package_id, version: row.version },
        "Paket sürümünün dosya listesi özetiyle eşleşmiyor",
      );
      throw new AppError("package_integrity_failed");
    }
    for (const file of files) await readBlob(row.package_id, row.version, file);
  }

  /**
   * Veritabanındaki bütün sürümleri depoyla karşılaştırır: her sürümün dosya listesi özetiyle,
   * depodaki her dosya da kendi özetiyle eşleşmelidir. Hiçbir kaydı değiştirmez, bulduklarını
   * döndürür. Yedekten dönüşten ya da depo başka bir diske taşındıktan sonra çalıştırılır.
   */
  async function verifyStore(): Promise<StoreReport> {
    const versions = await db.many<PackageVersionRow>(sql`
      select ${PACKAGE_VERSION_COLUMNS}
      from package_versions v
      order by v.package_id, v.version_key
    `);
    const states = new Map<string, PackageStoreError["reason"] | null>();
    const problems: StoreProblem[] = [];
    let files = 0;

    /** İçeriğin depodaki durumu; aynı içerik depodan yalnızca bir kez okunur. */
    async function stateOf(file: PackageFileRow): Promise<PackageStoreError["reason"] | null> {
      const key = `${file.sha256}:${file.size}`;
      const known = states.get(key);
      if (known !== undefined) return known;
      let state: PackageStoreError["reason"] | null = null;
      try {
        await loadBlob(file);
      } catch (error) {
        if (!(error instanceof PackageStoreError)) throw error;
        state = error.reason;
      }
      states.set(key, state);
      return state;
    }

    for (const row of versions) {
      const subject = { packageId: row.package_id, version: row.version, status: row.status };
      const rows = await filesOf(db, row.package_id, row.version);
      files += rows.length;
      if (sha256(packageDigestInput(rows)) !== row.digest) {
        problems.push({ ...subject, path: null, reason: "digest_mismatch" });
      }
      for (const file of rows) {
        const reason = await stateOf(file);
        if (reason !== null) problems.push({ ...subject, path: file.path, reason });
      }
    }
    return { versions: versions.length, files, contents: states.size, problems };
  }

  /** Sürüm numarası daha önce kullanılmamış ve yüklenmiş bütün sürümlerden büyük olmalıdır. */
  async function requireNewVersion(tx: Database, packageId: string, version: string) {
    const versions = await tx.many<{ version: string }>(sql`
      select version from package_versions where package_id = ${packageId}
    `);
    if (versions.some((row) => row.version === version)) {
      throw new AppError("package_version_exists");
    }
    if (versions.some((row) => compareVersions(row.version, version) > 0)) {
      throw new AppError("package_version_not_newer");
    }
  }

  /**
   * Yüklenen arşivi denetler ve yeni bir taslak sürüm olarak kaydeder. Arşiv kurallara uymuyorsa
   * hiçbir şey saklanmaz. Kaydedilen sürümün dosyaları bu andan sonra değiştirilemez.
   */
  async function upload(
    actor: string,
    packageId: string,
    archive: Buffer,
  ): Promise<AdminPackageVersion> {
    const exists = await db.maybeOne(sql`select 1 from packages where id = ${packageId}`);
    if (exists === null) throw new AppError("package_not_found");

    const inspected = inspectPackage(archive, {
      maxArchiveBytes: config.packageMaxBytes,
      allowInsecureNetwork: config.miniAppDevMode,
    });
    const { manifest, files } = inspected;
    if (manifest.id !== packageId) {
      throw new AppError("package_invalid", [
        {
          file: PACKAGE_MANIFEST_FILE,
          message: `Bildirim dosyasındaki kimlik (${manifest.id}) bu paketin kimliğiyle (${packageId}) eşleşmiyor.`,
        },
      ]);
    }
    await requireNewVersion(db, packageId, manifest.version);

    // Dosyalar önce depoya yazılır: içerik adresli olduğu için yarıda kalan bir yükleme zararsız
    // artık bırakır, hiçbir sürüm bu dosyaları göstermez.
    for (const file of files) await packageStore.put(file.data);

    await db.transaction(async (tx) => {
      // Aynı pakete eşzamanlı yüklemeler sıraya girer; sürüm sırası burada kesinleşir.
      await tx.one(sql`select id from packages where id = ${packageId} for update`);
      await requireNewVersion(tx, packageId, manifest.version);
      await tx.execute(sql`
        insert into package_versions (
          package_id, version, name, digest, size_bytes, file_count, entry, icon,
          permissions, network, config_fields, findings, uploaded_by
        )
        values (
          ${packageId},
          ${manifest.version},
          ${manifest.name},
          ${inspected.digest},
          ${inspected.sizeBytes},
          ${files.length},
          ${manifest.entry},
          ${manifest.icon ?? null},
          ${manifest.permissions}::text[],
          ${manifest.network}::text[],
          ${JSON.stringify(manifest.config)}::jsonb,
          ${JSON.stringify(inspected.findings)}::jsonb,
          ${actor}
        )
      `);
      await tx.execute(sql`
        insert into package_files (package_id, version, path, sha256, size, content_type)
        select ${packageId}, ${manifest.version}, f.path, f.sha256, f.size, f.content_type
        from unnest(
          ${files.map((file) => file.path)}::text[],
          ${files.map((file) => file.sha256)}::text[],
          ${files.map((file) => file.size)}::integer[],
          ${files.map((file) => file.contentType)}::text[]
        ) as f (path, sha256, size, content_type)
      `);
      await recordAudit(tx, {
        actor,
        action: "package.version_uploaded",
        targetType: "package",
        targetId: packageId,
        metadata: {
          version: manifest.version,
          digest: inspected.digest,
          sizeBytes: inspected.sizeBytes,
          fileCount: files.length,
        },
      });
    });
    return getVersion(packageId, manifest.version);
  }

  async function transition(
    actor: string,
    packageId: string,
    version: string,
    change: Transition,
  ): Promise<AdminPackageVersion> {
    const { review } = change;
    const updated = await db.transaction(async (tx) => {
      const count = await tx.execute(sql`
        update package_versions
        set
          status = ${change.to},
          submitted_at = ${change.to === "in_review" ? sql`now()` : sql`submitted_at`},
          reviewed_by = ${review === undefined ? sql`reviewed_by` : sql`${actor}`},
          reviewed_at = ${review === undefined ? sql`reviewed_at` : sql`now()`},
          review_note = ${review === undefined ? sql`review_note` : sql`${review.note}`}
        where package_id = ${packageId}
          and version = ${version}
          and status = any(${change.from}::text[])
      `);
      if (count > 0) {
        await recordAudit(tx, {
          actor,
          action: change.action,
          targetType: "package",
          targetId: packageId,
          metadata: review === undefined ? { version } : { version, note: review.note },
        });
      }
      return count;
    });
    if (updated === 0) {
      const current = await findVersion(db, packageId, version);
      throw new AppError(current === null ? "package_version_not_found" : "package_state_invalid");
    }
    return getVersion(packageId, version);
  }

  async function requireVersion(packageId: string, version: string, status: PackageVersionStatus) {
    const row = await findVersion(db, packageId, version);
    if (row === null) throw new AppError("package_version_not_found");
    if (row.status !== status) throw new AppError("package_state_invalid");
    return row;
  }

  /** Taslağı incelemeye gönderir. */
  async function submit(actor: string, packageId: string, version: string) {
    await verifyIntegrity(await requireVersion(packageId, version, "draft"));
    return transition(actor, packageId, version, {
      from: ["draft"],
      to: "in_review",
      action: "package.version_submitted",
    });
  }

  /** İncelemedeki sürümü onaylar; onaylı sürüm uygulama kayıtlarında yayınlanabilir. */
  async function approve(actor: string, packageId: string, version: string, note: string | null) {
    await verifyIntegrity(await requireVersion(packageId, version, "in_review"));
    return transition(actor, packageId, version, {
      from: ["in_review"],
      to: "approved",
      action: "package.version_approved",
      review: { note },
    });
  }

  /** İncelemedeki sürümü gerekçesiyle reddeder. Düzeltme, yeni bir sürüm numarasıyla yüklenir. */
  function reject(actor: string, packageId: string, version: string, note: string) {
    return transition(actor, packageId, version, {
      from: ["in_review"],
      to: "rejected",
      action: "package.version_rejected",
      review: { note },
    });
  }

  /** Yükleyenin, henüz karara bağlanmamış sürümden vazgeçmesi. */
  function withdraw(actor: string, packageId: string, version: string) {
    return transition(actor, packageId, version, {
      from: ["draft", "in_review"],
      to: "withdrawn",
      action: "package.version_withdrawn",
    });
  }

  /**
   * Onaylı sürümü geri çeker: sürümü yayınlayan bütün uygulama kayıtları kullanıcılara hemen
   * kapanır ve dosyaları artık sunulmaz. `rollback` istenirse bu kayıtlar, varsa bir önceki
   * yayınlarına döndürülür; önceki yayını olmayanlar yeni bir sürüm yayınlanana kadar kapalı kalır.
   */
  async function revoke(actor: string, packageId: string, version: string, body: AdminRevokeBody) {
    const revoked = await transition(actor, packageId, version, {
      from: ["approved"],
      to: "revoked",
      action: "package.version_revoked",
      review: { note: body.note },
    });
    if (body.rollback !== true) return revoked;
    await miniAppAdmin.rollBackFrom(actor, packageId, version);
    return getVersion(packageId, version);
  }

  return {
    list,
    get,
    save,
    upload,
    getVersion,
    readFile,
    submit,
    approve,
    reject,
    withdraw,
    revoke,
    verifyStore,
  };
}

export type PackageService = ReturnType<typeof createPackageService>;
