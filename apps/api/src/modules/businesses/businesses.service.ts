import type { Business, BusinessDetail, Category, CreateBusinessBody } from "@vado/contracts";

import { recordAudit } from "../../core/audit";
import type { AppContext } from "../../core/context";
import { isUniqueViolation, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import {
  createMiniAppMapper,
  MINI_APP_COLUMNS,
  miniAppLive,
  type MiniAppRow,
} from "../miniapps/miniapp-rows";
import { BUSINESS_COLUMNS, BUSINESS_LISTED, type BusinessRow, toBusiness } from "./business-rows";

const LIST_LIMIT = 200;

export function createBusinessService({ config, db }: AppContext) {
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
    return { ...business, miniApps: miniApps.map(mapper.toMiniApp) };
  }

  /** İşletme, sahibi olan kullanıcıya ait ve listeleniyor mu? */
  async function isListedOwner(userId: string, businessId: string): Promise<boolean> {
    const row = await db.maybeOne(sql`
      select 1 from businesses b
      where b.id = ${businessId} and b.owner_id = ${userId} and ${BUSINESS_LISTED}
    `);
    return row !== null;
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
        await recordAudit(tx, {
          actor: userId,
          action: "business.created",
          targetType: "business",
          targetId: row.id,
          metadata: { slug: row.slug },
        });
        return toBusiness(row);
      });
    } catch (error) {
      if (isUniqueViolation(error, "businesses_slug_key")) throw new AppError("slug_taken");
      throw error;
    }
  }

  return { list, listOwned, find, get, isListedOwner, create };
}

export type BusinessService = ReturnType<typeof createBusinessService>;
