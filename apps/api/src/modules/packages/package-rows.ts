import type {
  AdminPackageVersionSummary,
  Capability,
  ConfigField,
  PackageDiff,
  PackageFile,
  PackageFinding,
  PackageVersionStatus,
} from "@vado/contracts";

import { sql } from "../../core/database";

export interface PackageVersionRow {
  package_id: string;
  version: string;
  name: string;
  status: PackageVersionStatus;
  digest: string;
  size_bytes: number;
  file_count: number;
  entry: string;
  icon: string | null;
  permissions: Capability[];
  network: string[];
  config_fields: ConfigField[];
  findings: PackageFinding[];
  uploaded_by: string;
  created_at: Date;
  submitted_at: Date | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  review_note: string | null;
}

/** `package_versions v` takma adıyla kullanılan ortak sütun listesi. */
export const PACKAGE_VERSION_COLUMNS = sql`
  v.package_id, v.version, v.name, v.status, v.digest, v.size_bytes, v.file_count, v.entry,
  v.icon, v.permissions, v.network, v.config_fields, v.findings, v.uploaded_by, v.created_at,
  v.submitted_at, v.reviewed_by, v.reviewed_at, v.review_note
`;

export interface PackageFileRow {
  path: string;
  sha256: string;
  size: number;
  content_type: string;
}

export function toPackageFile(row: PackageFileRow): PackageFile {
  return { path: row.path, sha256: row.sha256, size: row.size, contentType: row.content_type };
}

export function toVersionSummary(row: PackageVersionRow): AdminPackageVersionSummary {
  const count = (level: PackageFinding["level"]) =>
    row.findings.filter((finding) => finding.level === level).length;
  return {
    packageId: row.package_id,
    version: row.version,
    name: row.name,
    status: row.status,
    digest: row.digest,
    sizeBytes: row.size_bytes,
    fileCount: row.file_count,
    permissions: row.permissions,
    network: row.network,
    findingCounts: { blocked: count("blocked"), review: count("review"), info: count("info") },
    uploadedBy: row.uploaded_by,
    createdAt: row.created_at.toISOString(),
    submittedAt: row.submitted_at?.toISOString() ?? null,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at?.toISOString() ?? null,
    reviewNote: row.review_note,
  };
}

/** Bir sürümün, karşılaştırıldığı önceki sürümle birlikte içeriği. */
export interface VersionContent {
  version: PackageVersionRow;
  files: readonly PackageFileRow[];
}

const added = <T>(base: readonly T[], next: readonly T[]) =>
  next.filter((item) => !base.includes(item));

/** İki sürümün farkı: inceleyenin "bu sürümde ne değişti" sorusunun yanıtı. */
export function diffVersions(base: VersionContent, next: VersionContent): PackageDiff {
  const before = new Map(base.files.map((file) => [file.path, file.sha256]));
  const after = new Map(next.files.map((file) => [file.path, file.sha256]));
  const kept = [...after.keys()].filter((path) => before.has(path));
  const changed = kept.filter((path) => before.get(path) !== after.get(path));

  const fieldsBefore = new Map(
    base.version.config_fields.map((field) => [field.key, JSON.stringify(field)]),
  );
  const fieldsAfter = new Map(
    next.version.config_fields.map((field) => [field.key, JSON.stringify(field)]),
  );
  const keptFields = [...fieldsAfter.keys()].filter((key) => fieldsBefore.has(key));

  return {
    base: base.version.version,
    files: {
      added: [...after.keys()].filter((path) => !before.has(path)),
      removed: [...before.keys()].filter((path) => !after.has(path)),
      changed,
      unchanged: kept.length - changed.length,
    },
    permissions: {
      added: added(base.version.permissions, next.version.permissions),
      removed: added(next.version.permissions, base.version.permissions),
    },
    network: {
      added: added(base.version.network, next.version.network),
      removed: added(next.version.network, base.version.network),
    },
    configFields: {
      added: [...fieldsAfter.keys()].filter((key) => !fieldsBefore.has(key)),
      removed: [...fieldsBefore.keys()].filter((key) => !fieldsAfter.has(key)),
      changed: keptFields.filter((key) => fieldsBefore.get(key) !== fieldsAfter.get(key)),
    },
    entryChanged: base.version.entry !== next.version.entry,
    sizeDelta: next.version.size_bytes - base.version.size_bytes,
  };
}
