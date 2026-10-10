import {
  type Business,
  type BusinessDetail,
  type Category,
  type CreateBusinessBody,
  publicStorefrontSchema,
  type PublishStudioBody,
  type SaveStudioBody,
  type StudioConfiguration,
  type StudioDesign,
  studioDesignSchema,
  studioStorefrontSchema,
  studioTemplateById,
} from "@vado/contracts";

import { recordAudit } from "../../core/audit";
import type { AppContext } from "../../core/context";
import { type Database, isUniqueViolation, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { requireBusinessRole, type TenantScope, withTenant } from "../../core/tenant-scope";
import {
  createMiniAppMapper,
  MINI_APP_COLUMNS,
  miniAppLive,
  type MiniAppRow,
} from "../miniapps/miniapp-rows";
import { BUSINESS_COLUMNS, BUSINESS_LISTED, type BusinessRow, toBusiness } from "./business-rows";

const LIST_LIMIT = 200;

export function createBusinessService({ config, db, storage }: AppContext) {
  const mapper = createMiniAppMapper(config);

  async function list(category?: Category): Promise<Business[]> {
    const rows = await db.many<BusinessRow>(sql`
      select ${BUSINESS_COLUMNS}
      from businesses b
      where ${BUSINESS_LISTED}
        ${category === undefined ? sql.empty : sql`and b.category = ${category}`}
      order by b.name
      limit ${LIST_LIMIT}
    `);
    return rows.map(toBusiness);
  }

  /** Kullanıcının kendi işletmeleri; onay bekleyen ve askıdaki kayıtlar da döner. */
  async function listOwned(userId: string): Promise<Business[]> {
    const rows = await db.many<BusinessRow>(sql`
      select ${BUSINESS_COLUMNS}
      from businesses b
      where b.owner_id = ${userId}
      order by b.created_at desc
    `);
    return rows.map(toBusiness);
  }

  /** Listelenen işletmeyi okur; yoksa veya listelenmiyorsa `null` döner. */
  async function find(businessId: string): Promise<Business | null> {
    const row = await db.maybeOne<BusinessRow>(sql`
      select ${BUSINESS_COLUMNS}
      from businesses b
      where b.id = ${businessId} and ${BUSINESS_LISTED}
    `);
    return row === null ? null : toBusiness(row);
  }

  async function get(businessId: string): Promise<BusinessDetail> {
    const business = await find(businessId);
    if (business === null) throw new AppError("business_not_found");

    const miniApps = await db.many<MiniAppRow>(sql`
      select ${MINI_APP_COLUMNS}
      from mini_app_runtime a
      where ${miniAppLive(config.miniAppDevMode)}
        and exists (
          select 1 from mini_app_merchants mm
          where mm.mini_app_id = a.id and mm.business_id = ${businessId} and mm.active
        )
      order by a.sort_order, a.name
    `);
    // Studio tablosu RLS ile işletmeye ayrılmıştır. Burada genel bir RLS istisnası
    // açılmıyor: müşteri profilinin zaten listelenebilir olduğu AYNI işlemde
    // doğrulanır, geçici kapsam yalnızca bu işlem süresince tanımlanır.
    const storefront = await db.transaction(async (tx) => {
      const listed = await tx.maybeOne(sql`
        select 1 from businesses b
        where b.id = ${businessId} and ${BUSINESS_LISTED}
        for share
      `);
      if (listed === null) throw new AppError("business_not_found");
      const previous = await tx.one<{ business_id: string | null }>(sql`
        select nullif(current_setting('vado.business_id', true), '') as business_id
      `);
      if (previous.business_id !== null) throw new AppError("forbidden");
      await tx.execute(sql`select set_config('vado.business_id', ${businessId}, true)`);
      const publication = await tx.maybeOne<{ published_design: unknown }>(sql`
        select published_design from business_studio
        where business_id = ${businessId} and published_design is not null
      `);
      if (publication === null) return null;
      const design = studioDesignSchema.parse(publication.published_design);
      const media = await studioMediaUrls(tx, design.logoMediaId, design.coverMediaId);
      // JSON taslağındaki medya kimlikleri ve iç alanlar kamusal yanıtın dışındadır.
      return publicStorefrontSchema.parse({ ...design, ...media });
    });
    return { ...business, miniApps: miniApps.map(mapper.toMiniApp), storefront };
  }

  /** İşletme, sahibi olan kullanıcıya ait ve listeleniyor mu? */
  async function isListedOwner(userId: string, businessId: string): Promise<boolean> {
    const row = await db.maybeOne(sql`
      select 1 from businesses b
      where b.id = ${businessId} and b.owner_id = ${userId} and ${BUSINESS_LISTED}
    `);
    return row !== null;
  }

  interface StudioRow {
    template_id: StudioConfiguration["templateId"];
    published_from_version: number | null;
    title: string;
    tagline: string;
    palette: StudioConfiguration["palette"];
    version: number;
    updated_at: Date;
    published_design: StudioDesign | null;
    published_version: number;
    published_at: Date | null;
    logo_media_id: string | null;
    cover_media_id: string | null;
  }
  const STUDIO_COLUMNS = sql`template_id, published_from_version, title, tagline, palette, version,
    updated_at, published_design, published_version, published_at, logo_media_id, cover_media_id`;
  async function studioMediaUrls(tx: Database, logoId: string | null, coverId: string | null) {
    const ids = [logoId, coverId].filter((id): id is string => id !== null);
    const entries =
      ids.length === 0
        ? []
        : await tx.many<{ id: string; storage_key: string }>(sql`
      select id, storage_key from media where id = any(${ids}::uuid[])
    `);
    const url = (id: string | null) =>
      id === null ? null : (entries.find((entry) => entry.id === id)?.storage_key ?? null);
    const logoKey = url(logoId);
    const coverKey = url(coverId);
    return {
      logoUrl: logoKey === null ? null : storage.publicUrl(logoKey),
      coverUrl: coverKey === null ? null : storage.publicUrl(coverKey),
    };
  }
  async function studioView(tx: Database, row: StudioRow | null, businessName: string) {
    const design = row?.published_design ?? null;
    const published = design === null ? null : studioDesignSchema.parse(design);
    const draftMedia = await studioMediaUrls(
      tx,
      row?.logo_media_id ?? null,
      row?.cover_media_id ?? null,
    );
    const publishedMedia =
      published === null
        ? null
        : await studioMediaUrls(tx, published.logoMediaId, published.coverMediaId);
    return {
      configuration:
        row === null
          ? null
          : ({
              templateId: row.template_id,
              // Taslak, son yayımlanan sürümden ilerideyse yayımlanmamış değişiklik vardır.
              status: row.published_from_version === row.version ? "ready" : "draft",
              title: row.title || businessName,
              tagline: row.tagline,
              palette: row.palette,
              version: row.version,
              updatedAt: row.updated_at.toISOString(),
              logoMediaId: row.logo_media_id,
              coverMediaId: row.cover_media_id,
              ...draftMedia,
            } satisfies StudioConfiguration),
      published:
        published === null
          ? null
          : studioStorefrontSchema.parse({ ...published, ...publishedMedia }),
      publishedVersion: row?.published_version ?? 0,
      publishedAt: row?.published_at?.toISOString() ?? null,
    };
  }

  /** İşletmenin görünüm taslağı yalnız doğrulanmış üyelik kapsamında okunur. */
  function studio(scope: TenantScope) {
    requireBusinessRole(scope, ["owner", "manager", "staff"]);
    return withTenant(db, scope, async (tx) => {
      const business = await tx.one<{ name: string; category: Category }>(sql`
        select name, category from businesses where id = ${scope.businessId}
      `);
      const row = await tx.maybeOne<StudioRow>(sql`
        select ${STUDIO_COLUMNS}
        from business_studio where business_id = ${scope.businessId}
      `);
      return {
        businessName: business.name,
        category: business.category,
        ...(await studioView(tx, row, business.name)),
      };
    });
  }

  /** Stüdyo ayarları taslak olarak kaydedilir; başka işletmeye veya sektöre geçilemez. */
  async function saveStudio(scope: TenantScope, body: SaveStudioBody) {
    requireBusinessRole(scope, ["owner", "manager"]);
    try {
      return await withTenant(db, scope, async (tx) => {
        const business = await tx.one<{ name: string; category: Category }>(sql`
          select name, category from businesses where id = ${scope.businessId} for share
        `);
        if (studioTemplateById(body.templateId).category !== business.category)
          throw new AppError("validation_failed");
        const requestedMedia = [body.logoMediaId, body.coverMediaId].filter(
          (id): id is string => id !== null,
        );
        if (requestedMedia.length > 0) {
          const existing = await tx.one<{ count: number }>(sql`
            select count(*)::int as count from business_media
            where business_id = ${scope.businessId}
              and media_id = any(${[...new Set(requestedMedia)]}::uuid[])
          `);
          if (existing.count !== new Set(requestedMedia).size)
            throw new AppError("media_not_found");
        }
        let row: StudioRow | null;
        if (body.expectedVersion === 0) {
          row = await tx.maybeOne<StudioRow>(sql`
            insert into business_studio (business_id, template_id, title, tagline, palette,
              logo_media_id, cover_media_id)
            values (${scope.businessId}, ${body.templateId}, ${body.title}, ${body.tagline}, ${body.palette},
              ${body.logoMediaId}, ${body.coverMediaId})
            on conflict (business_id) do nothing
            returning ${STUDIO_COLUMNS}
          `);
        } else {
          row = await tx.maybeOne<StudioRow>(sql`
            update business_studio set
              template_id = ${body.templateId},
              title = ${body.title}, tagline = ${body.tagline}, palette = ${body.palette},
              logo_media_id = ${body.logoMediaId}, cover_media_id = ${body.coverMediaId},
              version = version + 1, updated_at = now()
            where business_id = ${scope.businessId} and version = ${body.expectedVersion}
            returning ${STUDIO_COLUMNS}
          `);
        }
        if (row === null) throw new AppError("record_version_conflict");
        await recordAudit(tx, {
          actor: scope.userId,
          action: "business.studio.updated",
          targetType: "business",
          targetId: scope.businessId,
          metadata: { templateId: body.templateId, version: row.version },
        });
        return {
          businessName: business.name,
          category: business.category,
          ...(await studioView(tx, row, business.name)),
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError("record_version_conflict");
      throw error;
    }
  }

  /** Yayın, CAS ile korunmuş tam bir tasarım anlık görüntüsüdür. */
  async function publishStudio(scope: TenantScope, body: PublishStudioBody) {
    requireBusinessRole(scope, ["owner", "manager"]);
    return withTenant(db, scope, async (tx) => {
      const business = await tx.one<{
        name: string;
        category: Category;
        status: string;
        verified: boolean;
      }>(sql`
        select name, category, status, verified from businesses
        where id = ${scope.businessId} for share
      `);
      if (business.status !== "active" || !business.verified)
        throw new AppError("verification_required");
      const row = await tx.maybeOne<StudioRow>(sql`
        update business_studio set
          published_design = jsonb_build_object('templateId', template_id, 'title',
            coalesce(nullif(title, ''), ${business.name}),
            'tagline', tagline, 'palette', palette,
            'logoMediaId', logo_media_id, 'coverMediaId', cover_media_id),
          published_version = published_version + 1,
          published_at = now(),
          published_from_version = version
        where business_id = ${scope.businessId} and version = ${body.expectedVersion}
        returning ${STUDIO_COLUMNS}
      `);
      if (row === null) throw new AppError("record_version_conflict");
      if (studioTemplateById(row.template_id).category !== business.category)
        throw new AppError("validation_failed");
      await recordAudit(tx, {
        actor: scope.userId,
        action: "business.studio.published",
        targetType: "business",
        targetId: scope.businessId,
        metadata: { designVersion: row.version, publishedVersion: row.published_version },
      });
      return {
        businessName: business.name,
        category: business.category,
        ...(await studioView(tx, row, business.name)),
      };
    });
  }

  /** İşletme başvurusu oluşturur. Kayıt, yönetim panelinde onaylanana kadar listelenmez. */
  async function create(userId: string, body: CreateBusinessBody): Promise<Business> {
    try {
      return await db.transaction(async (tx) => {
        const row = await tx.one<BusinessRow>(sql`
          insert into businesses as b
            (owner_id, name, slug, category, description, city, tax_number)
          values (
            ${userId},
            ${body.name},
            ${body.slug},
            ${body.category},
            ${body.description ?? ""},
            ${body.city},
            ${body.taxNumber ?? null}
          )
          returning ${BUSINESS_COLUMNS}
        `);
        if (body.templateId !== undefined) {
          // Yeni işletmenin kapsamı yalnızca bu işlem süresince etkin olur.
          const old = await tx.one<{ scope: string | null }>(sql`
            select nullif(current_setting('vado.business_id', true), '') as scope
          `);
          await tx.execute(sql`select set_config('vado.business_id', ${row.id}, true)`);
          await tx.execute(sql`
            insert into business_studio (business_id, template_id)
            values (${row.id}, ${body.templateId})
          `);
          await tx.execute(sql`select set_config('vado.business_id', ${old.scope ?? ""}, true)`);
        }
        await recordAudit(tx, {
          actor: userId,
          action: "business.created",
          targetType: "business",
          targetId: row.id,
          metadata: { slug: row.slug, templateId: body.templateId ?? null },
        });
        return toBusiness(row);
      });
    } catch (error) {
      if (isUniqueViolation(error, "businesses_slug_key")) throw new AppError("slug_taken");
      throw error;
    }
  }

  return { list, listOwned, find, get, isListedOwner, create, studio, saveStudio, publishStudio };
}

export type BusinessService = ReturnType<typeof createBusinessService>;
