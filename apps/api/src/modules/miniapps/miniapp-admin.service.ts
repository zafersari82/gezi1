import { isDeepStrictEqual } from "node:util";

import {
  type Actor,
  type AdminMiniApp,
  type AdminMiniAppSummary,
  type AdminPublishMiniAppBody,
  type AdminRolloutResult,
  type AdminSaveMerchantBody,
  type AdminSaveMiniAppBody,
  type AdminUpdateMiniAppBody,
  type ConfigField,
  type ConfigProblem,
  type ConfigValues,
  configValueSchema,
  type MerchantBinding,
  type MiniAppRelease,
  type MiniAppReleaseAction,
  type MiniAppSource,
  originOf,
  type PackageVersionStatus,
  resolveConfig,
} from "@vado/contracts";

import { recordAudit, resolveActors } from "../../core/audit";
import type { AppContext } from "../../core/context";
import { type Database, sql, type SqlFragment } from "../../core/database";
import { AppError } from "../../core/errors";
import {
  createMiniAppMapper,
  MINI_APP_COLUMNS,
  type MiniAppRow,
  offlineReasonOf,
} from "./miniapp-rows";
import { type ReleaseState, type ReleaseStep, rollbackTarget } from "./release-history";

const LIST_LIMIT = 200;
const RELEASES_SHOWN = 50;
const DEFAULT_SORT_ORDER = 100;

interface MerchantRow {
  mini_app_id: string;
  merchant_id: string;
  display_name: string;
  business_id: string | null;
  active: boolean;
}

interface ReleaseRow extends ReleaseStep {
  seq: number;
  actor: string;
  created_at: Date;
}

/** İşlem içinde kilitlenmiş uygulama kaydı. */
interface LockedApp {
  source: MiniAppSource;
  package_id: string | null;
  package_version: string | null;
  config: ConfigValues;
}

/** Arama metnini LIKE deseni olarak güvenle kullanmak için özel karakterleri kaçırır. */
function containsPattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

function toMerchant(row: MerchantRow): MerchantBinding {
  return {
    merchantId: row.merchant_id,
    displayName: row.display_name,
    businessId: row.business_id,
    active: row.active,
  };
}

function toRelease(row: ReleaseRow, actorOf: (actor: string) => Actor): MiniAppRelease {
  return {
    seq: row.seq,
    packageId: row.package_id,
    version: row.version,
    action: row.action,
    config: row.config,
    actor: actorOf(row.actor),
    createdAt: row.created_at.toISOString(),
  };
}

/** Kaydın yayındaki paket sürümü; hiç yayın yapılmadıysa `null`. */
function releaseOf(row: MiniAppRow): AdminMiniAppSummary["release"] {
  if (
    row.package_id === null ||
    row.package_version === null ||
    row.package_name === null ||
    row.package_status === null ||
    row.package_digest === null
  ) {
    return null;
  }
  return {
    packageId: row.package_id,
    packageName: row.package_name,
    version: row.package_version,
    status: row.package_status,
    digest: row.package_digest,
    network: row.network,
    configFields: row.package_config_fields ?? [],
  };
}

/** Değerleri metin, sayı ya da evet/hayır olmayan anahtarları sorun olarak döndürür. */
function freeFormProblems(input: Record<string, unknown>): ConfigProblem[] {
  return Object.entries(input)
    .filter(([, value]) => !configValueSchema.safeParse(value).success)
    .map(([key]) => ({ key, message: "Değer metin, sayı ya da evet/hayır olmalı." }));
}

/**
 * Önceki sürümle kullanılan ayarları yeni sürüme taşır: yeni sürümün tanımadığı anahtarlar
 * bırakılır, kalanlar yeni sürümün alanlarına göre doğrulanır.
 */
function carryOverConfig(fields: readonly ConfigField[], current: ConfigValues) {
  const known = new Set(fields.map((field) => field.key));
  const kept = Object.fromEntries(Object.entries(current).filter(([key]) => known.has(key)));
  return resolveConfig(fields, kept);
}

/**
 * Uygulama kayıtlarının yönetimi. Uygulama kaydı bir işletmenin vitrinidir; çalıştırdığı kod,
 * yayınladığı paket sürümünden gelir. Kayıt başına kod incelemesi yapılmaz: onaylı bir sürüm,
 * onu yayınlayan bütün kayıtlarda aynıdır.
 */
export function createMiniAppAdminService({ config, db }: AppContext) {
  const mapper = createMiniAppMapper(config);

  function toSummary(row: MiniAppRow, merchants: readonly MerchantRow[]): AdminMiniAppSummary {
    const runtime = mapper.runtimeOf(row);
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      iconUrl: runtime.iconUrl,
      customIconUrl: row.icon_url,
      category: row.category,
      developerName: row.developer_name,
      source: row.source,
      verified: row.verified,
      enabled: row.enabled,
      offlineReason: offlineReasonOf(row, config.miniAppDevMode),
      sortOrder: row.sort_order,
      version: row.version,
      capabilities: row.capabilities,
      entryUrl: runtime.entryUrl,
      release: releaseOf(row),
      config: row.config,
      development:
        row.source === "url" && row.entry_url !== null
          ? { entryUrl: row.entry_url, allowedOrigins: row.allowed_origins }
          : null,
      merchants: merchants.filter((merchant) => merchant.mini_app_id === row.id).map(toMerchant),
      updatedAt: row.updated_at.toISOString(),
    };
  }

  async function summaries(filter: SqlFragment): Promise<AdminMiniAppSummary[]> {
    const rows = await db.many<MiniAppRow>(sql`
      select ${MINI_APP_COLUMNS}
      from mini_app_runtime a
      where ${filter}
      order by a.sort_order, a.name
      limit ${LIST_LIMIT}
    `);
    const merchants = await db.many<MerchantRow>(sql`
      select mini_app_id, merchant_id, display_name, business_id, active
      from mini_app_merchants
      where mini_app_id = any(${rows.map((row) => row.id)}::text[])
      order by merchant_id
    `);
    return rows.map((row) => toSummary(row, merchants));
  }

  function list(query?: string): Promise<AdminMiniAppSummary[]> {
    if (query === undefined || query === "") return summaries(sql`true`);
    const pattern = containsPattern(query);
    return summaries(sql`(a.id like ${pattern} or a.name ilike ${pattern})`);
  }

  async function get(miniAppId: string): Promise<AdminMiniApp> {
    const [summary] = await summaries(sql`a.id = ${miniAppId}`);
    if (summary === undefined) throw new AppError("miniapp_not_found");
    const releases = await db.many<ReleaseRow>(sql`
      select seq, package_id, version, action, config, actor, created_at
      from mini_app_releases
      where mini_app_id = ${miniAppId}
      order by seq desc
      limit ${RELEASES_SHOWN}
    `);
    const actorOf = await resolveActors(
      db,
      releases.map((release) => release.actor),
    );
    return { ...summary, releases: releases.map((release) => toRelease(release, actorOf)) };
  }

  /** Kaydı işlem sonuna kadar kilitler; aynı kayda eşzamanlı yayınlar sıraya girer. */
  async function lockApp(tx: Database, miniAppId: string): Promise<LockedApp> {
    const app = await tx.maybeOne<LockedApp>(sql`
      select source, package_id, package_version, config
      from mini_apps
      where id = ${miniAppId}
      for update
    `);
    if (app === null) throw new AppError("miniapp_not_found");
    return app;
  }

  /** Yayın geçmişine bir adım ekler ve kaydı o adımın gösterdiği sürüme ve ayarlara getirir. */
  async function appendRelease(
    tx: Database,
    actor: string,
    miniAppId: string,
    action: MiniAppReleaseAction,
    state: ReleaseState,
  ): Promise<void> {
    const settings = JSON.stringify(state.config);
    await tx.execute(sql`
      insert into mini_app_releases (mini_app_id, seq, package_id, version, action, config, actor)
      select
        ${miniAppId}, coalesce(max(seq), 0) + 1, ${state.packageId}, ${state.version},
        ${action}, ${settings}::jsonb, ${actor}
      from mini_app_releases
      where mini_app_id = ${miniAppId}
    `);
    // Adresle açılan bir kayıt ilk yayınla birlikte paket kaydına dönüşür; kimliği değişmediği
    // için kullanıcıların o uygulamadaki kimlikleri (openId) ve ödeme geçmişi korunur.
    await tx.execute(sql`
      update mini_apps
      set
        source = 'package',
        package_id = ${state.packageId},
        package_version = ${state.version},
        config = ${settings}::jsonb,
        entry_url = null,
        allowed_origins = '{}',
        capabilities = '{}',
        version = null,
        updated_at = now()
      where id = ${miniAppId}
    `);
  }

  /**
   * Kilitli kayıtta onaylı sürümü yayınlar. Ayarlar sürümün beklediği alanlarla eşleşmiyorsa
   * hiçbir şey değişmez ve sorunlar döner.
   */
  async function publishLocked(
    tx: Database,
    actor: string,
    miniAppId: string,
    app: LockedApp,
    target: { packageId: string; version: string; config?: Record<string, unknown> | undefined },
  ): Promise<ConfigProblem[]> {
    const version = await tx.maybeOne<{
      status: PackageVersionStatus;
      config_fields: ConfigField[];
    }>(sql`
      select status, config_fields
      from package_versions
      where package_id = ${target.packageId} and version = ${target.version}
    `);
    if (version === null) throw new AppError("package_version_not_found");
    if (version.status !== "approved") throw new AppError("miniapp_version_not_approved");
    if (app.package_id !== null && app.package_id !== target.packageId) {
      throw new AppError("miniapp_package_mismatch");
    }

    const { values, problems } =
      target.config === undefined
        ? carryOverConfig(version.config_fields, app.config)
        : resolveConfig(version.config_fields, target.config);
    if (problems.length > 0) return problems;

    const sameVersion = app.package_version === target.version;
    if (sameVersion && isDeepStrictEqual(values, app.config)) return [];

    const state = { packageId: target.packageId, version: target.version, config: values };
    await appendRelease(tx, actor, miniAppId, sameVersion ? "config" : "publish", state);
    await recordAudit(tx, {
      actor,
      action: sameVersion ? "miniapp.config_saved" : "miniapp.published",
      targetType: "miniapp",
      targetId: miniAppId,
      metadata: {
        packageId: target.packageId,
        version: target.version,
        previousVersion: app.package_version,
      },
    });
    return [];
  }

  /**
   * Onaylı bir paket sürümünü kayıtta yayınlar. Ayar verilmezse kaydın o anki ayarları yeni
   * sürüme taşınır. Bir kayıt, ilk yayınından sonra başka bir pakete geçirilemez.
   */
  async function publish(
    actor: string,
    miniAppId: string,
    body: AdminPublishMiniAppBody,
  ): Promise<AdminMiniApp> {
    const problems = await db.transaction(async (tx) => {
      const app = await lockApp(tx, miniAppId);
      return publishLocked(tx, actor, miniAppId, app, body);
    });
    if (problems.length > 0) throw new AppError("miniapp_config_invalid", problems);
    return get(miniAppId);
  }

  /**
   * Bir sürümü, paketin daha eski sürümlerini yayınlayan bütün kayıtlara dağıtır. Her kayıt kendi
   * işleminde güncellenir; ayarları yeni sürümle eşleşmeyen kayıtlar olduğu gibi bırakılır ve
   * nedenleriyle birlikte bildirilir.
   */
  async function rollout(
    actor: string,
    packageId: string,
    version: string,
  ): Promise<AdminRolloutResult> {
    const target = await db.maybeOne<{ status: PackageVersionStatus }>(sql`
      select status from package_versions where package_id = ${packageId} and version = ${version}
    `);
    if (target === null) throw new AppError("package_version_not_found");
    if (target.status !== "approved") throw new AppError("miniapp_version_not_approved");

    const candidates = await db.many<{ id: string; name: string }>(sql`
      select id, name
      from mini_apps
      where package_id = ${packageId}
        and string_to_array(package_version, '.')::integer[]
          < string_to_array(${version}, '.')::integer[]
      order by id
    `);

    const result: AdminRolloutResult = { published: [], skipped: [] };
    for (const { id, name } of candidates) {
      const problems = await db.transaction(async (tx) => {
        const app = await lockApp(tx, id);
        return publishLocked(tx, actor, id, app, { packageId, version });
      });
      if (problems.length === 0) result.published.push(id);
      else result.skipped.push({ id, name, problems });
    }
    return result;
  }

  /** Kilitli kaydı bir önceki yayınına döndürür; dönülecek yayın yoksa `false`. */
  async function rollbackLocked(
    tx: Database,
    actor: string,
    miniAppId: string,
    app: LockedApp,
  ): Promise<boolean> {
    if (app.package_id === null) return false;

    const steps = await tx.many<ReleaseStep>(sql`
      select action, package_id, version, config
      from mini_app_releases
      where mini_app_id = ${miniAppId}
      order by seq
    `);
    const approved = await tx.many<{ version: string }>(sql`
      select version from package_versions
      where package_id = ${app.package_id} and status = 'approved'
    `);
    const runnable = new Set(approved.map((row) => row.version));
    const target = rollbackTarget(steps, (version) => runnable.has(version));
    if (target === null) return false;

    await appendRelease(tx, actor, miniAppId, "rollback", target);
    await recordAudit(tx, {
      actor,
      action: "miniapp.rolled_back",
      targetType: "miniapp",
      targetId: miniAppId,
      metadata: {
        packageId: target.packageId,
        version: target.version,
        previousVersion: app.package_version,
      },
    });
    return true;
  }

  /**
   * Son yayını geri alır: kayıt, bir önceki yayınına o yayınla en son kullanılan ayarlarla döner.
   * Aradaki onayı kalkmış sürümler atlanır.
   */
  async function rollback(actor: string, miniAppId: string): Promise<AdminMiniApp> {
    const rolledBack = await db.transaction(async (tx) => {
      const app = await lockApp(tx, miniAppId);
      return rollbackLocked(tx, actor, miniAppId, app);
    });
    if (!rolledBack) throw new AppError("miniapp_no_previous_release");
    return get(miniAppId);
  }

  /** Verilen sürümü yayınlayan bütün kayıtları, varsa bir önceki yayınlarına döndürür. */
  async function rollBackFrom(actor: string, packageId: string, version: string): Promise<void> {
    const apps = await db.many<{ id: string }>(sql`
      select id from mini_apps
      where package_id = ${packageId} and package_version = ${version}
      order by id
    `);
    for (const { id } of apps) {
      await db.transaction(async (tx) => {
        const app = await lockApp(tx, id);
        if (app.package_id !== packageId || app.package_version !== version) return;
        await rollbackLocked(tx, actor, id, app);
      });
    }
  }

  /**
   * Kaydın işletmeye özel ayarlarını değiştirir. Paketle yayınlanan kayıtta ayarlar yayındaki
   * sürümün bildirdiği alanlara göre doğrulanır ve yayın geçmişine yazılır.
   */
  async function saveConfig(
    actor: string,
    miniAppId: string,
    input: Record<string, unknown>,
  ): Promise<AdminMiniApp> {
    await db.transaction(async (tx) => {
      const app = await lockApp(tx, miniAppId);

      if (app.package_id === null || app.package_version === null) {
        // Yayınlanmış bir sürüm yokken doğrulanacak alan da yoktur: adresle açılan geliştirme
        // kaydı serbest ayar alır, yayın bekleyen paket kaydı ise ayar alamaz.
        const problems =
          app.source === "url" ? freeFormProblems(input) : resolveConfig([], input).problems;
        if (problems.length > 0) throw new AppError("miniapp_config_invalid", problems);
        await tx.execute(sql`
          update mini_apps
          set config = ${JSON.stringify(input)}::jsonb, updated_at = now()
          where id = ${miniAppId}
        `);
      } else {
        const version = await tx.one<{ config_fields: ConfigField[] }>(sql`
          select config_fields from package_versions
          where package_id = ${app.package_id} and version = ${app.package_version}
        `);
        const { values, problems } = resolveConfig(version.config_fields, input);
        if (problems.length > 0) throw new AppError("miniapp_config_invalid", problems);
        if (isDeepStrictEqual(values, app.config)) return;
        const state = { packageId: app.package_id, version: app.package_version, config: values };
        await appendRelease(tx, actor, miniAppId, "config", state);
      }
      await recordAudit(tx, {
        actor,
        action: "miniapp.config_saved",
        targetType: "miniapp",
        targetId: miniAppId,
      });
    });
    return get(miniAppId);
  }

  /**
   * Kaydın vitrinini oluşturur veya günceller. Yeni kayıt doğrulanmamış başlar ve bir paket
   * sürümü yayınlanana kadar kullanıcılara kapalıdır.
   *
   * `development` verilirse kayıt geliştiricinin kendi sunucusundan açılır; bu yalnızca geliştirme
   * kipinde kabul edilir. Böyle bir kayıtta giriş adresi, izinli kaynaklar veya yetkiler değişirse
   * doğrulama sıfırlanır.
   */
  async function save(
    actor: string,
    miniAppId: string,
    body: AdminSaveMiniAppBody,
  ): Promise<AdminMiniApp> {
    const iconUrl = body.iconUrl ?? null;
    if (iconUrl !== null && !iconUrl.startsWith("https://") && !config.miniAppDevMode) {
      throw new AppError("validation_failed", [
        { path: "iconUrl", message: "Simge adresi https ile başlamalı" },
      ]);
    }
    const { development } = body;

    await db.transaction(async (tx) => {
      if (development === undefined) await saveShowcase(tx, miniAppId, body, iconUrl);
      else await saveDevelopmentRecord(tx, miniAppId, body, iconUrl, development);
      await recordAudit(tx, {
        actor,
        action: "miniapp.saved",
        targetType: "miniapp",
        targetId: miniAppId,
        metadata:
          development === undefined
            ? { name: body.name }
            : { name: body.name, entryUrl: development.entryUrl, version: development.version },
      });
    });
    return get(miniAppId);
  }

  /** Vitrin bilgilerini yazar; kayıt yoksa paketle yayınlanacak yeni bir kayıt açar. */
  async function saveShowcase(
    tx: Database,
    miniAppId: string,
    body: AdminSaveMiniAppBody,
    iconUrl: string | null,
  ): Promise<void> {
    await tx.execute(sql`
      insert into mini_apps as a (
        id, name, description, icon_url, category, developer_name, sort_order,
        source, allowed_origins, capabilities
      )
      values (
        ${miniAppId},
        ${body.name},
        ${body.description},
        ${iconUrl},
        ${body.category},
        ${body.developerName},
        ${body.sortOrder ?? DEFAULT_SORT_ORDER},
        'package',
        '{}',
        '{}'
      )
      on conflict (id) do update set
        name = excluded.name,
        description = excluded.description,
        icon_url = excluded.icon_url,
        category = excluded.category,
        developer_name = excluded.developer_name,
        sort_order = coalesce(${body.sortOrder ?? null}, a.sort_order),
        updated_at = now()
    `);
  }

  /** Geliştiricinin sunucusundan açılan kaydı yazar; paketle yayınlanan kayda dokunmaz. */
  async function saveDevelopmentRecord(
    tx: Database,
    miniAppId: string,
    body: AdminSaveMiniAppBody,
    iconUrl: string | null,
    development: NonNullable<AdminSaveMiniAppBody["development"]>,
  ): Promise<void> {
    if (!config.miniAppDevMode) throw new AppError("miniapp_url_mode_disabled");

    const entryOrigin = originOf(development.entryUrl);
    const origins = development.allowedOrigins.map(originOf);
    const valid = (origin: string | null): origin is string => origin !== null;
    if (entryOrigin === null || !origins.every(valid) || !origins.includes(entryOrigin)) {
      throw new AppError("miniapp_origin_invalid");
    }
    const allowedOrigins = [...new Set(origins)].sort();
    const capabilities = [...new Set(development.capabilities)].sort();

    const updated = await tx.execute(sql`
      insert into mini_apps as a (
        id, name, description, icon_url, category, developer_name, sort_order,
        source, entry_url, allowed_origins, capabilities, version
      )
      values (
        ${miniAppId},
        ${body.name},
        ${body.description},
        ${iconUrl},
        ${body.category},
        ${body.developerName},
        ${body.sortOrder ?? DEFAULT_SORT_ORDER},
        'url',
        ${development.entryUrl},
        ${allowedOrigins}::text[],
        ${capabilities}::text[],
        ${development.version}
      )
      on conflict (id) do update set
        name = excluded.name,
        description = excluded.description,
        icon_url = excluded.icon_url,
        category = excluded.category,
        developer_name = excluded.developer_name,
        sort_order = coalesce(${body.sortOrder ?? null}, a.sort_order),
        entry_url = excluded.entry_url,
        allowed_origins = excluded.allowed_origins,
        capabilities = excluded.capabilities,
        version = excluded.version,
        verified = a.verified
          and a.entry_url = excluded.entry_url
          and a.allowed_origins = excluded.allowed_origins
          and a.capabilities = excluded.capabilities,
        updated_at = now()
      where a.source = 'url'
    `);
    if (updated === 0) throw new AppError("miniapp_source_fixed");
  }

  /**
   * Kaydı doğrular ya da kullanıma açıp kapatır. Kapatma, sorunlu bir kaydı kullanıcılardan
   * hemen gizlemek içindir: liste, ödeme ve paket dosyaları aynı anda kapanır.
   */
  async function update(
    actor: string,
    miniAppId: string,
    body: AdminUpdateMiniAppBody,
  ): Promise<void> {
    const updated = await db.transaction(async (tx) => {
      const count = await tx.execute(sql`
        update mini_apps
        set
          verified = coalesce(${body.verified ?? null}, verified),
          enabled = coalesce(${body.enabled ?? null}, enabled),
          updated_at = now()
        where id = ${miniAppId}
      `);
      if (count > 0) {
        await recordAudit(tx, {
          actor,
          action: "miniapp.updated",
          targetType: "miniapp",
          targetId: miniAppId,
          metadata: body,
        });
      }
      return count;
    });
    if (updated === 0) throw new AppError("miniapp_not_found");
  }

  /** Satıcıyı mini uygulamaya bağlar; bağlı olmayan satıcı adına ödeme oturumu açılamaz. */
  async function saveMerchant(
    actor: string,
    miniAppId: string,
    merchantId: string,
    body: AdminSaveMerchantBody,
  ): Promise<void> {
    const miniApp = await db.maybeOne(sql`select 1 from mini_apps where id = ${miniAppId}`);
    if (miniApp === null) throw new AppError("miniapp_not_found");
    if (body.businessId !== undefined && body.businessId !== null) {
      const business = await db.maybeOne(sql`
        select 1 from businesses where id = ${body.businessId}
      `);
      if (business === null) throw new AppError("business_not_found");
    }

    await db.transaction(async (tx) => {
      await tx.execute(sql`
        insert into mini_app_merchants (mini_app_id, merchant_id, display_name, business_id, active)
        values (
          ${miniAppId},
          ${merchantId},
          ${body.displayName},
          ${body.businessId ?? null},
          ${body.active ?? true}
        )
        on conflict (mini_app_id, merchant_id) do update set
          display_name = excluded.display_name,
          business_id = excluded.business_id,
          active = excluded.active
      `);
      await recordAudit(tx, {
        actor,
        action: "miniapp.merchant_saved",
        targetType: "miniapp",
        targetId: miniAppId,
        metadata: { merchantId, ...body },
      });
    });
  }

  return {
    list,
    get,
    save,
    update,
    saveMerchant,
    publish,
    rollout,
    rollback,
    rollBackFrom,
    saveConfig,
  };
}

export type MiniAppAdminService = ReturnType<typeof createMiniAppAdminService>;
