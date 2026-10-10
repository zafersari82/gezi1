import {
  type Favorite,
  type FavoriteBody,
  favoriteSchema,
  type PageQuery,
  type Review,
  type ReviewBody,
  type ReviewEditBody,
  type ReviewReplyBody,
  reviewSchema,
} from "@vado/contracts";

import { recordAudit } from "../../core/audit";
import { authorize, permittedBranch } from "../../core/business-access";
import type { TenantContext } from "../../core/context";
import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { appendEvent } from "../../core/outbox-events";
import { withPlatformMutation } from "../../core/platform-mutations";
import { requireBusinessRole, type TenantScope, withTenant } from "../../core/tenant-scope";

interface ReviewRow {
  id: string;
  business_id: string;
  branch_id: string;
  order_id: string;
  business_customer_id: string;
  seq: number | string;
  rating: number;
  comment: string;
  reply: string | null;
  visibility: "published" | "hidden";
  version: number;
  created_at: Date;
  updated_at: Date;
}
interface FavoriteRow {
  id: string;
  business_id: string;
  item_id: string | null;
  value: boolean;
  version: number;
  name: string;
  available: boolean;
}
function review(row: ReviewRow): Review {
  return reviewSchema.parse({
    id: row.id,
    businessId: row.business_id,
    orderId: row.order_id,
    businessCustomerId: row.business_customer_id,
    rating: row.rating,
    comment: row.comment,
    reply: row.reply,
    visibility: row.visibility,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  });
}
function favorite(row: FavoriteRow): Favorite {
  return favoriteSchema.parse({
    id: row.id,
    businessId: row.business_id,
    itemId: row.item_id,
    value: row.value,
    version: row.version,
    name: row.name,
    available: row.available,
  });
}
function personal(scope: TenantScope) {
  if (scope.role !== "customer" || scope.businessCustomerId === null)
    throw new AppError("forbidden");
  return { userId: scope.userId, customerId: scope.businessCustomerId };
}
export function createFeedbackService({ db }: TenantContext) {
  async function changed(tx: Database, scope: TenantScope, value: Review | Favorite, type: string) {
    await recordAudit(tx, {
      actor: scope.userId ?? "device",
      action: type,
      targetType: type.startsWith("review") ? "review" : "favorite",
      targetId: value.id,
      metadata: { businessId: scope.businessId, version: value.version },
    });
    await appendEvent(tx, scope, {
      aggregateId: value.id,
      sequence: value.version,
      type,
      payload: { id: value.id, version: value.version },
    });
    return value;
  }
  function listReviews(scope: TenantScope, page: PageQuery, management = false) {
    if (management) requireBusinessRole(scope, ["owner", "manager", "staff"]);
    return withTenant(db, scope, async (tx) => {
      if (page.cursor !== undefined && !/^\d+$/.test(page.cursor))
        throw new AppError("validation_failed");
      const rows = await tx.many<ReviewRow>(
        sql`select r.id,r.business_id,r.branch_id,r.order_id,r.business_customer_id,r.seq::text as seq,
          r.rating,r.comment,r.reply,r.visibility,r.version,r.created_at,r.updated_at
        from reviews r
        where r.business_id=${scope.businessId}
          ${management ? permittedBranch(scope, "reviews.reply", sql`r.branch_id`) : sql`and r.visibility='published'`}
          ${page.cursor === undefined ? sql.empty : sql`and r.seq<${page.cursor}::bigint`}
        order by r.seq desc limit ${page.limit + 1}`,
      );
      const items = rows.slice(0, page.limit),
        last = items.at(-1);
      return {
        items: items.map(review),
        nextCursor: rows.length > page.limit && last !== undefined ? String(last.seq) : null,
      };
    });
  }
  function createReview(scope: TenantScope, id: string, key: string, body: ReviewBody) {
    const actor = personal(scope);
    return withTenant(db, scope, (tx) =>
      withPlatformMutation(
        tx,
        actor.userId,
        scope.businessId,
        `review/${id}`,
        key,
        body,
        async () => {
          const order = await tx.maybeOne<{ status: string; version: number; branch_id: string }>(
            sql`select status,version,branch_id from orders where business_id=${scope.businessId} and id=${id} and business_customer_id=${actor.customerId} and app_instance_id=${scope.appInstanceId} for share`,
          );
          if (order === null) throw new AppError("not_found");
          if (order.status !== "completed") throw new AppError("review_order_invalid");
          if (order.version !== body.expectedOrderVersion)
            throw new AppError("order_version_conflict");
          if (
            (await tx.maybeOne(
              sql`select id from reviews where business_id=${scope.businessId} and order_id=${id}`,
            )) !== null
          )
            throw new AppError("review_exists");
          await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${id},732))`);
          const row = await tx.maybeOne<ReviewRow>(
            sql`insert into reviews(business_id,branch_id,order_id,business_customer_id,rating,comment) values(${scope.businessId},${order.branch_id},${id},${actor.customerId},${body.rating},${body.comment}) on conflict(business_id,order_id) do nothing returning *`,
          );
          if (row === null) throw new AppError("review_exists");
          return changed(tx, scope, review(row), "review.created");
        },
      ),
    );
  }
  function editReview(
    scope: TenantScope,
    id: string,
    key: string,
    body: ReviewEditBody | ReviewReplyBody,
  ) {
    if ("reply" in body) requireBusinessRole(scope, ["owner", "manager", "staff"]);
    else personal(scope);
    if (scope.userId === null) throw new AppError("forbidden");
    const userId = scope.userId;
    return withTenant(db, scope, (tx) =>
      withPlatformMutation(
        tx,
        userId,
        scope.businessId,
        `review.edit/${id}`,
        key,
        body,
        async () => {
          const owned =
            "reply" in body
              ? sql.empty
              : sql`and business_customer_id=${scope.businessCustomerId}
                  and exists (select 1 from orders o where o.business_id=reviews.business_id
                    and o.id=reviews.order_id and o.app_instance_id=${scope.appInstanceId})`;
          const current = await tx.maybeOne<ReviewRow>(
            sql`select * from reviews where business_id=${scope.businessId} and id=${id} ${owned} for update`,
          );
          if (current === null) throw new AppError("not_found");
          if ("reply" in body) await authorize(tx, scope, "reviews.reply", current.branch_id);
          if (current.version !== body.expectedVersion)
            throw new AppError("record_version_conflict", { review: review(current) });
          const update =
            "reply" in body
              ? sql`reply=${body.reply}`
              : sql`rating=${body.rating},comment=${body.comment}`;
          const row = await tx.one<ReviewRow>(
            sql`update reviews set ${update},version=version+1 where business_id=${scope.businessId} and id=${id} returning *`,
          );
          return changed(tx, scope, review(row), "review.updated");
        },
      ),
    );
  }
  async function favoriteView(tx: Database, scope: TenantScope, id: string) {
    return favorite(
      await tx.one<FavoriteRow>(
        sql`select f.*,coalesce(i.name,b.name) as name,case when f.item_id is null then true else coalesce(i.active and i.available,false) end as available from user_favorites f join businesses b on b.id=f.business_id left join catalog_items i on i.business_id=f.business_id and i.id=f.item_id where f.business_id=${scope.businessId} and f.id=${id}`,
      ),
    );
  }
  function listFavorites(scope: TenantScope, page: PageQuery) {
    const actor = personal(scope);
    return withTenant(db, scope, async (tx) => {
      const rows = await tx.many<FavoriteRow & { seq: string }>(
        sql`select f.id,f.business_id,f.item_id,f.value,f.version,f.seq::text as seq,
          coalesce(i.name,b.name) as name,
          case when f.item_id is null then true else coalesce(i.active and i.available,false) end as available
        from user_favorites f
        join businesses b on b.id=f.business_id
        left join catalog_items i on i.business_id=f.business_id and i.id=f.item_id
        where f.user_id=${actor.userId} and f.business_id=${scope.businessId}
          ${page.cursor === undefined ? sql.empty : sql`and f.seq<${page.cursor}::bigint`}
        order by f.seq desc limit ${page.limit + 1}`,
      );
      const items = rows.slice(0, page.limit),
        last = items.at(-1);
      return {
        items: items.map(favorite),
        nextCursor: rows.length > page.limit && last !== undefined ? last.seq : null,
      };
    });
  }
  function saveFavorite(scope: TenantScope, key: string, body: FavoriteBody) {
    const actor = personal(scope);
    return withTenant(db, scope, (tx) =>
      withPlatformMutation(tx, actor.userId, scope.businessId, "favorite", key, body, async () => {
        if (
          body.itemId !== null &&
          (await tx.maybeOne(
            sql`select id from catalog_items where business_id=${scope.businessId} and id=${body.itemId} and active for share`,
          )) === null
        )
          throw new AppError("not_found");
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`${actor.userId}/${scope.businessId}/${body.itemId ?? "business"}`},733))`,
        );
        const current = await tx.maybeOne<{ id: string; version: number }>(
          sql`select id,version from user_favorites where user_id=${actor.userId} and business_id=${scope.businessId} and item_id is not distinct from ${body.itemId}::uuid for update`,
        );
        if ((current?.version ?? 0) !== body.expectedVersion)
          throw new AppError(
            "record_version_conflict",
            current === null ? {} : { favorite: await favoriteView(tx, scope, current.id) },
          );
        const saved =
          current === null
            ? await tx.one<{ id: string }>(
                sql`insert into user_favorites(user_id,business_id,item_id,value) values(${actor.userId},${scope.businessId},${body.itemId},${body.value}) returning id`,
              )
            : await tx.one<{ id: string }>(
                sql`update user_favorites set value=${body.value},version=version+1 where id=${current.id} returning id`,
              );
        return changed(tx, scope, await favoriteView(tx, scope, saved.id), "favorite.changed");
      }),
    );
  }
  return { listReviews, createReview, editReview, listFavorites, saveFavorite };
}
