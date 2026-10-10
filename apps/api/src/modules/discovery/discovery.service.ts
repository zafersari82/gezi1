import type { Category, DiscoveryItem, DiscoveryPage, DiscoveryQuery } from "@vado/contracts";

import type { AppContext } from "../../core/context";
import { sql, type SqlFragment } from "../../core/database";
import { BUSINESS_COLUMNS, BUSINESS_LISTED, type BusinessRow, toBusiness } from "../businesses/business-rows";
import { createMiniAppMapper, MINI_APP_COLUMNS, miniAppLive, type MiniAppRow } from "../miniapps/miniapp-rows";
import { decodeDiscoveryCursor, encodeDiscoveryCursor } from "./discovery-cursor";

interface RankedRow {
  kind: "business" | "miniapp";
  record_id: string;
  name_key: string;
  score: number;
}

/** Tek sıralamada iki kayıt türünü arar; sonuçları tek tek sorgulamaz. */
export function createDiscoveryService({ config, db }: AppContext) {
  const mapper = createMiniAppMapper(config);
  const live = miniAppLive(config.miniAppDevMode);

  async function search(query: DiscoveryQuery): Promise<DiscoveryPage> {
    const cleaned = query.q.trim().replace(/\s+/g, " ");
    const terms = cleaned.split(" ").filter(Boolean);
    const position = decodeDiscoveryCursor(query);
    const kind = query.kind;
    const category: Category | undefined = query.category;
    const businessText = sql`vado_discovery_fold(b.name || ' ' || b.description || ' ' || b.city)`;
    const miniAppText = sql`vado_discovery_fold(a.name || ' ' || a.description || ' ' || a.developer_name)`;
    // Arama metnindeki % ve _ kullanıcı verisidir, SQL LIKE joker karakteri değildir.
    const literal = (text: string): SqlFragment => sql`replace(replace(replace(
      vado_discovery_fold(${text}), '!', '!!'), '%', '!%'), '_', '!_')`;
    const contains = (haystack: SqlFragment, term: string): SqlFragment =>
      sql`${haystack} like '%' || ${literal(term)} || '%' escape '!'`;
    const predicate = (haystack: SqlFragment): SqlFragment =>
      terms.length === 0 ? sql.empty : sql`and ${sql.join(terms.map((term) =>
        contains(haystack, term)), " and ")}`;
    const relevance = (name: SqlFragment): SqlFragment => sql`(
      case when ${cleaned}::text = '' then 0
        when vado_discovery_fold(${name}) = vado_discovery_fold(${cleaned}) then 3
        when vado_discovery_fold(${name}) like ${literal(cleaned)} || '%' escape '!' then 2
        when ${terms.length === 0 ? sql`false` : sql.join(terms.map((term) =>
          contains(sql`vado_discovery_fold(${name})`, term)), " and ")}
          then 1 else 0 end
    )`;
    // Dinamik diziler SQL metnine eklenmez; her değer bağlı parametre olarak gönderilir.
    // İl/ilçe eşleşmesi etkin şubelerden gelir. İl düzeyinde eski işletme kaydındaki
    // şehir adı da kullanılabilir; ilçe düzeyinde serbest adres metni tahmin edilmez.
    const locationPredicate = query.provinceId === undefined ? sql.empty :
      query.districtId !== undefined ? sql`and exists (
        select 1 from branch_discovery_locations br where br.business_id=b.id
          and br.province_id=${query.provinceId} and br.district_id=${query.districtId}
      )` : sql`and (
        exists(select 1 from branch_discovery_locations br where br.business_id=b.id
          and br.province_id=${query.provinceId})
        or exists(select 1 from location_provinces p where p.id=${query.provinceId}
          and vado_discovery_fold(p.name) = vado_discovery_fold(b.city))
      )`;
    const businessSelect = sql`
      select 'business'::text as kind, b.id::text as record_id,
        vado_discovery_fold(b.name) as name_key, ${relevance(sql`b.name`)} as score
      from businesses b where ${BUSINESS_LISTED}
        ${category === undefined ? sql.empty : sql`and b.category = ${category}`}
        ${predicate(businessText)}
        ${locationPredicate}
    `;
    const miniAppSelect = sql`
      select 'miniapp'::text as kind, a.id::text as record_id,
        vado_discovery_fold(a.name) as name_key, ${relevance(sql`a.name`)} as score
      from mini_app_runtime a where ${live}
        ${category === undefined ? sql.empty : sql`and a.category = ${category}`}
        ${predicate(miniAppText)}
    `;
    const union = kind === "business" ? businessSelect :
      kind === "miniapp" ? miniAppSelect : sql`${businessSelect} union all ${miniAppSelect}`;
    const seek = position === null ? sql.empty : sql`where (
      score < ${position.score} or
      (score = ${position.score} and (name_key, kind, record_id) >
        (${position.nameKey}, ${position.kind}, ${position.recordId}))
    )`;
    const rows = await db.many<RankedRow>(sql`
      with candidates as (${union})
      select kind, record_id, name_key, score from candidates ${seek}
      order by score desc, name_key asc, kind asc, record_id asc
      limit ${query.limit + 1}
    `);
    const current = rows.slice(0, query.limit);
    const businessIds = current.filter((row) => row.kind === "business").map((row) => row.record_id);
    const miniAppIds = current.filter((row) => row.kind === "miniapp").map((row) => row.record_id);
    const [businessRows, miniAppRows] = await Promise.all([
      businessIds.length === 0 ? Promise.resolve([]) : db.many<BusinessRow>(sql`
        select ${BUSINESS_COLUMNS} from businesses b
        where b.id = any(${businessIds}::uuid[]) and ${BUSINESS_LISTED}
      `),
      miniAppIds.length === 0 ? Promise.resolve([]) : db.many<MiniAppRow>(sql`
        select ${MINI_APP_COLUMNS} from mini_app_runtime a
        where a.id = any(${miniAppIds}::text[]) and ${live}
      `),
    ]);
    const businesses = new Map(businessRows.map((row) => [row.id, toBusiness(row)]));
    const miniApps = new Map(miniAppRows.map((row) => [row.id, mapper.toMiniApp(row)]));
    const items: DiscoveryItem[] = current.flatMap((row) => {
      if (row.kind === "business") {
        const business = businesses.get(row.record_id);
        return business === undefined ? [] : [{ kind: "business" as const, business }];
      }
      const miniApp = miniApps.get(row.record_id);
      return miniApp === undefined ? [] : [{ kind: "miniapp" as const, miniApp }];
    });
    const last = current.at(-1);
    return {
      items,
      nextCursor: rows.length > query.limit && last !== undefined ? encodeDiscoveryCursor(query, {
        score: last.score, nameKey: last.name_key, kind: last.kind, recordId: last.record_id,
      }) : null,
    };
  }

  return { search };
}
