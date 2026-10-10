import type { ChannelFollowing, ChannelPage, ChannelPost } from "@vado/contracts";

import { recordAudit } from "../../core/audit";
import type { AppContext } from "../../core/context";
import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { requireBusinessRole, type TenantScope, withTenant } from "../../core/tenant-scope";

interface PostRow {
  id: string;
  seq: string;
  business_id: string;
  business_name: string;
  body: string;
  created_at: Date;
}

function toPost(row: PostRow): ChannelPost {
  return {
    id: row.id,
    businessId: row.business_id,
    businessName: row.business_name,
    body: row.body,
    publishedAt: row.created_at.toISOString(),
  };
}

function pageOf(rows: PostRow[], limit: number): ChannelPage {
  const hasMore = rows.length > limit;
  const visible = rows.slice(0, limit);
  return {
    items: visible.map(toPost),
    nextCursor: hasMore ? (visible[visible.length - 1]?.seq ?? null) : null,
  };
}

/** Kişisel takip yalnız doğrulanmış oturum kullanıcısının SQL işlemi içinde yürür. */
export function createChannelService({ db }: AppContext) {
  function withViewer<T>(userId: string, run: (tx: Database) => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      const existing = await tx.one<{ user_id: string | null }>(sql`
        select nullif(current_setting('vado.user_id', true), '') as user_id
      `);
      if (existing.user_id !== null) throw new AppError("forbidden");
      await tx.execute(sql`select set_config('vado.user_id', ${userId}, true)`);
      return run(tx);
    });
  }

  async function follow(userId: string, businessId: string, value: boolean) {
    return withViewer(userId, async (tx) => {
      if (value) {
        const eligible = await tx.maybeOne(sql`
          select 1 from businesses b join users owner on owner.id = b.owner_id
          where b.id = ${businessId} and b.status = 'active' and b.verified
            and owner.status = 'active' for share of b,owner
        `);
        if (eligible === null) throw new AppError("business_not_found");
        await tx.execute(sql`
          insert into business_channel_follows(user_id, business_id)
          values(${userId}, ${businessId}) on conflict do nothing
        `);
      } else {
        await tx.execute(sql`
          delete from business_channel_follows
          where user_id = ${userId} and business_id = ${businessId}
        `);
      }
      return { following: value };
    });
  }

  async function followStatus(userId: string, businessId: string) {
    return withViewer(userId, async (tx) => {
      const row = await tx.maybeOne(sql`
        select 1 from business_channel_follows
        where user_id = ${userId} and business_id = ${businessId}
      `);
      return { following: row !== null };
    });
  }

  async function following(userId: string): Promise<ChannelFollowing[]> {
    return withViewer(userId, async (tx) => {
      const rows = await tx.many<{
        business_id: string;
        business_name: string;
        followed_at: Date;
      }>(sql`
        select f.business_id, b.name as business_name, f.followed_at
        from business_channel_follows f
        join businesses b on b.id = f.business_id
        join users owner on owner.id = b.owner_id
        where f.user_id = ${userId} and b.status = 'active' and b.verified
          and owner.status = 'active'
        order by f.followed_at desc, f.business_id
        limit 200
      `);
      return rows.map((row) => ({
        businessId: row.business_id,
        businessName: row.business_name,
        followedAt: row.followed_at.toISOString(),
      }));
    });
  }

  async function listPosts(
    businessId: string,
    limit: number,
    cursor?: string,
  ): Promise<ChannelPage> {
    const rows = await db.many<PostRow>(sql`
      select p.id, p.seq::text as seq, p.business_id, b.name as business_name,
        p.body, p.created_at
      from business_channel_posts p
      join businesses b on b.id = p.business_id
      where p.business_id = ${businessId} and p.status = 'published'
        ${cursor === undefined ? sql.empty : sql`and p.seq < ${cursor}::bigint`}
      order by p.seq desc limit ${limit + 1}
    `);
    return pageOf(rows, limit);
  }

  async function feed(userId: string, limit: number, cursor?: string): Promise<ChannelPage> {
    return withViewer(userId, async (tx) => {
      const rows = await tx.many<PostRow>(sql`
        select p.id, p.seq::text as seq, p.business_id, b.name as business_name,
          p.body, p.created_at
        from business_channel_follows f
        join business_channel_posts p on p.business_id = f.business_id
        join businesses b on b.id = p.business_id
        join users owner on owner.id = b.owner_id
        where f.user_id = ${userId} and p.status = 'published'
          and b.status = 'active' and b.verified and owner.status = 'active'
          ${cursor === undefined ? sql.empty : sql`and p.seq < ${cursor}::bigint`}
        order by p.seq desc limit ${limit + 1}
      `);
      return pageOf(rows, limit);
    });
  }

  async function publish(scope: TenantScope, body: string): Promise<ChannelPost> {
    requireBusinessRole(scope, ["owner", "manager"]);
    return withTenant(db, scope, async (tx) => {
      const eligible = await tx.maybeOne(sql`
        select 1 from businesses b join users owner on owner.id = b.owner_id
        where b.id = ${scope.businessId} and b.status = 'active' and b.verified
          and owner.status = 'active' for share of b, owner
      `);
      if (eligible === null) throw new AppError("business_not_found");
      const post = await tx.one<PostRow>(sql`
        with created as (
          insert into business_channel_posts(business_id, created_by, body)
          values(${scope.businessId}, ${scope.userId}, ${body})
          returning id, seq, business_id, body, created_at
        )
        select c.id, c.seq::text as seq, c.business_id, b.name as business_name,
          c.body, c.created_at
        from created c join businesses b on b.id = c.business_id
      `);
      await recordAudit(tx, {
        actor: scope.userId,
        action: "channel.published",
        targetType: "business_channel_post",
        targetId: post.id,
        metadata: { businessId: scope.businessId },
      });
      return toPost(post);
    });
  }

  async function withdraw(scope: TenantScope, postId: string) {
    requireBusinessRole(scope, ["owner", "manager"]);
    return withTenant(db, scope, async (tx) => {
      const changed = await tx.execute(sql`
        update business_channel_posts set status = 'withdrawn'
        where business_id = ${scope.businessId} and id = ${postId} and status = 'published'
      `);
      if (changed === 0) throw new AppError("not_found");
      await recordAudit(tx, {
        actor: scope.userId,
        action: "channel.withdrawn",
        targetType: "business_channel_post",
        targetId: postId,
        metadata: { businessId: scope.businessId },
      });
      return { ok: true };
    });
  }

  return { follow, followStatus, following, listPosts, feed, publish, withdraw };
}
