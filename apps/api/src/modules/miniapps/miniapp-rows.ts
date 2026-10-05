import type {
  Capability,
  Category,
  ConfigField,
  ConfigValues,
  MiniApp,
  MiniAppDetail,
  MiniAppOfflineReason,
  MiniAppSource,
  PackageVersionStatus,
} from "@vado/contracts";

import type { Config } from "../../core/config";
import { sql, type SqlFragment } from "../../core/database";
import { createPackageUrls } from "../../core/package-urls";
import { sha256 } from "../../core/security";

/** `mini_app_runtime` görünümünün satırı: kaydın vitrini ve çalışma anındaki hali. */
export interface MiniAppRow {
  id: string;
  name: string;
  description: string;
  icon_url: string | null;
  category: Category;
  developer_name: string;
  verified: boolean;
  enabled: boolean;
  sort_order: number;
  source: MiniAppSource;
  config: ConfigValues;
  /** Yalnızca adresle açılan kayıtlarda. */
  entry_url: string | null;
  allowed_origins: string[];
  /** Yalnızca paketle yayınlanan kayıtlarda, ilk yayından sonra. */
  package_id: string | null;
  package_version: string | null;
  package_name: string | null;
  package_status: PackageVersionStatus | null;
  package_digest: string | null;
  package_entry: string | null;
  package_icon: string | null;
  package_config_fields: ConfigField[] | null;
  network: string[];
  capabilities: Capability[];
  version: string | null;
  updated_at: Date;
}

/** `mini_app_runtime a` takma adıyla kullanılan ortak sütun listesi. */
export const MINI_APP_COLUMNS = sql`
  a.id, a.name, a.description, a.icon_url, a.category, a.developer_name, a.verified, a.enabled,
  a.sort_order, a.source, a.config, a.entry_url, a.allowed_origins, a.package_id,
  a.package_version, a.package_name, a.package_status, a.package_digest, a.package_entry,
  a.package_icon, a.package_config_fields, a.network, a.capabilities, a.version, a.updated_at
`;

/**
 * Kullanıcılara açık kayıt koşulu (`mini_app_runtime a`): kayıt doğrulanmış ve açık olmalı,
 * çalıştırılabilir bir sürümü bulunmalıdır. Çalıştırılabilir sürüm, onaylı bir paket sürümüdür;
 * adresle açılan kayıtlar yalnızca geliştirme kipinde çalışır.
 */
export function miniAppLive(devMode: boolean): SqlFragment {
  return sql`(
    a.enabled and a.verified
    and (a.package_status = 'approved' or (a.source = 'url' and ${devMode}::boolean))
  )`;
}

/** Kaydın kullanıcılara neden kapalı olduğu; açıksa `null`. `miniAppLive` ile aynı kuraldır. */
export function offlineReasonOf(row: MiniAppRow, devMode: boolean): MiniAppOfflineReason | null {
  if (!row.enabled) return "disabled";
  if (row.source === "url") {
    if (!devMode) return "url_mode_disabled";
  } else {
    if (row.package_status === null) return "unpublished";
    if (row.package_status !== "approved") return "version_unavailable";
  }
  return row.verified ? null : "unverified";
}

/** Kaydın kabuğa verilen çalışma bilgisi. Yayınlanmış bir sürümü olmayan kayıtta adres yoktur. */
export interface MiniAppRuntime {
  entryUrl: string | null;
  scope: string[];
  iconUrl: string | null;
  consentKey: string;
}

const CONSENT_KEY_LENGTH = 16;

export function createMiniAppMapper(config: Config) {
  const urls = createPackageUrls(config.publicUrl, config.appsOrigin);

  /**
   * Yetkilerin ve verinin gidebileceği adreslerin özeti. Yeni bir sürüm bunlardan birini
   * değiştirirse özet de değişir; kabuk, kullanıcının eski izinlerini geçersiz sayıp yeniden sorar.
   */
  function consentKey(row: MiniAppRow): string {
    const reach = row.source === "package" ? row.network : row.allowed_origins;
    const subject = JSON.stringify([[...row.capabilities].sort(), [...reach].sort()]);
    return sha256(subject).slice(0, CONSENT_KEY_LENGTH);
  }

  function runtimeOf(row: MiniAppRow): MiniAppRuntime {
    if (row.source === "url") {
      return {
        entryUrl: row.entry_url,
        scope: row.allowed_origins.map((origin) => `${origin}/`),
        iconUrl: row.icon_url,
        consentKey: consentKey(row),
      };
    }
    if (row.package_digest === null || row.package_entry === null) {
      return { entryUrl: null, scope: [], iconUrl: row.icon_url, consentKey: consentKey(row) };
    }
    // Kabuk paketi doğrudan değil, onu çerçeveleyen sarmalayıcı belgeyi açar.
    const wrapperUrl = urls.wrapperUrl(row.id, row.package_digest);
    const filesUrl = urls.filesUrl(row.id, row.package_digest);
    return {
      entryUrl: wrapperUrl,
      scope: [wrapperUrl, filesUrl],
      iconUrl:
        row.icon_url ?? (row.package_icon === null ? null : `${filesUrl}${row.package_icon}`),
      consentKey: consentKey(row),
    };
  }

  /** Kullanıcılara açık bir kaydı sözleşmedeki biçime çevirir. */
  function toMiniApp(row: MiniAppRow): MiniApp {
    const runtime = runtimeOf(row);
    if (runtime.entryUrl === null || row.version === null) {
      throw new Error(`Yayında olmayan mini uygulama kullanıcıya verilemez: ${row.id}`);
    }
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      iconUrl: runtime.iconUrl,
      category: row.category,
      developerName: row.developer_name,
      verified: row.verified,
      source: row.source,
      version: row.version,
      capabilities: row.capabilities,
      entryUrl: runtime.entryUrl,
      scope: runtime.scope,
      consentKey: runtime.consentKey,
    };
  }

  function toMiniAppDetail(row: MiniAppRow): MiniAppDetail {
    return { ...toMiniApp(row), config: row.config };
  }

  return { runtimeOf, toMiniApp, toMiniAppDetail };
}

export type MiniAppMapper = ReturnType<typeof createMiniAppMapper>;
