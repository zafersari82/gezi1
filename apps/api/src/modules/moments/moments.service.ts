import type { Moment, MomentComment, Page, PageQuery, UserRef } from "@vado/contracts";

import type { AppContext } from "../../core/context";
import { sql, type SqlFragment } from "../../core/database";
import { AppError } from "../../core/errors";
import { deleteUnusedMedia, removeFiles, requireOwnedMedia } from "../media/media.service";
import { toUserRef, type UserRefRow } from "../users/user-rows";

interface MomentRow extends UserRefRow {
  moment_id: string;
  seq: number;
  body: string;
  created_at: Date;
}

interface LikeRow extends UserRefRow {
  moment_id: string;
}

interface CommentRow extends UserRefRow {
  moment_id: string;
  comment_id: string;
  body: string;
  created_at: Date;
}

export function createMomentService({ db, storage }: AppContext) {
  /** Kullanıcı kendi paylaşımlarını ve kişilerinin paylaşımlarını görür (`moments m` süzgeci). */
  const visibleTo = (userId: string) => sql`
    (
      m.author_id = ${userId}
      or exists (
        select 1 from contacts c where c.user_id = ${userId} and c.contact_id = m.author_id
      )
    )
  `;

  /**
   * Beğeni ve yorumlarda yalnızca görüntüleyenin kendisi, paylaşım sahibi ve görüntüleyenin
   * kişileri görünür; ortak tanıdık olmayanların etkileşimleri gizlenir.
   */
  const interactionVisibleTo = (userId: string, actorColumn: SqlFragment) => sql`
    (
      ${actorColumn} = ${userId}
      or ${actorColumn} = m.author_id
      or exists (
        select 1 from contacts c where c.user_id = ${userId} and c.contact_id = ${actorColumn}
      )
    )
  `;

  async function hydrate(userId: string, rows: MomentRow[]): Promise<Moment[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.moment_id);

    const [images, likes, comments] = await Promise.all([
      db.many<{ moment_id: string; storage_key: string }>(sql`
        select mm.moment_id, md.storage_key
        from moment_media mm
        join media md on md.id = mm.media_id
        where mm.moment_id = any(${ids}::uuid[])
        order by mm.moment_id, mm.position
      `),
      db.many<LikeRow>(sql`
        select l.moment_id, r.id, r.display_name, r.status, r.avatar_key
        from moment_likes l
        join moments m on m.id = l.moment_id
        join user_refs r on r.id = l.user_id
        where l.moment_id = any(${ids}::uuid[])
          and ${interactionVisibleTo(userId, sql`l.user_id`)}
        order by l.created_at
      `),
      db.many<CommentRow>(sql`
        select
          mc.moment_id, mc.id as comment_id, mc.body, mc.created_at,
          r.id, r.display_name, r.status, r.avatar_key
        from moment_comments mc
        join moments m on m.id = mc.moment_id
        join user_refs r on r.id = mc.author_id
        where mc.moment_id = any(${ids}::uuid[])
          and ${interactionVisibleTo(userId, sql`mc.author_id`)}
        order by mc.created_at
      `),
    ]);

    return rows.map((row) => {
      const momentLikes: UserRef[] = likes
        .filter((like) => like.moment_id === row.moment_id)
        .map((like) => toUserRef(like, storage));
      const momentComments: MomentComment[] = comments
        .filter((comment) => comment.moment_id === row.moment_id)
        .map((comment) => ({
          id: comment.comment_id,
          author: toUserRef(comment, storage),
          body: comment.body,
          createdAt: comment.created_at.toISOString(),
        }));

      return {
        id: row.moment_id,
        seq: row.seq,
        author: toUserRef(row, storage),
        body: row.body,
        imageUrls: images
          .filter((image) => image.moment_id === row.moment_id)
          .map((image) => storage.publicUrl(image.storage_key)),
        likedByMe: momentLikes.some((like) => like.id === userId),
        likes: momentLikes,
        comments: momentComments,
        createdAt: row.created_at.toISOString(),
      };
    });
  }

  function selectMoments(userId: string, filter: SqlFragment, limit: number): Promise<MomentRow[]> {
    return db.many<MomentRow>(sql`
      select
        m.id as moment_id, m.seq, m.body, m.created_at,
        r.id, r.display_name, r.status, r.avatar_key
      from moments m
      join user_refs r on r.id = m.author_id
      where ${visibleTo(userId)} and ${filter}
      order by m.seq desc
      limit ${limit}
    `);
  }

  /** Görüntüleyenin erişebildiği tek bir paylaşımı okur; erişemiyorsa `moment_not_found`. */
  async function get(userId: string, momentId: string): Promise<Moment> {
    const rows = await selectMoments(userId, sql`m.id = ${momentId}`, 1);
    const [moment] = await hydrate(userId, rows);
    if (moment === undefined) throw new AppError("moment_not_found");
    return moment;
  }

  async function listFeed(userId: string, page: PageQuery): Promise<Page<Moment>> {
    const filter = page.cursor === undefined ? sql`true` : sql`m.seq < ${Number(page.cursor)}`;
    const rows = await selectMoments(userId, filter, page.limit + 1);
    const items = await hydrate(userId, rows.slice(0, page.limit));
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > page.limit && last !== undefined ? String(last.seq) : null,
    };
  }

  async function create(
    userId: string,
    body: string,
    mediaIds: readonly string[],
  ): Promise<Moment> {
    if (body === "" && mediaIds.length === 0) throw new AppError("moment_empty");
    await requireOwnedMedia(db, userId, mediaIds);

    const momentId = await db.transaction(async (tx) => {
      const moment = await tx.one<{ id: string }>(sql`
        insert into moments (author_id, body) values (${userId}, ${body}) returning id
      `);
      if (mediaIds.length > 0) {
        await tx.execute(sql`
          insert into moment_media (moment_id, position, media_id)
          select ${moment.id}, item.position, item.media_id
          from unnest(${mediaIds}::uuid[]) with ordinality as item (media_id, position)
        `);
      }
      return moment.id;
    });
    return get(userId, momentId);
  }

  /** Paylaşımı ve başka yerde kullanılmayan fotoğraflarını siler. */
  async function remove(userId: string, momentId: string): Promise<void> {
    const unusedKeys = await db.transaction(async (tx) => {
      const photos = await tx.many<{ media_id: string }>(sql`
        select mm.media_id
        from moment_media mm
        join moments m on m.id = mm.moment_id
        where m.id = ${momentId} and m.author_id = ${userId}
      `);
      const removed = await tx.execute(sql`
        delete from moments where id = ${momentId} and author_id = ${userId}
      `);
      if (removed === 0) throw new AppError("moment_not_found");
      return deleteUnusedMedia(
        tx,
        userId,
        photos.map((photo) => photo.media_id),
      );
    });
    await removeFiles(storage, unusedKeys);
  }

  async function setLiked(userId: string, momentId: string, liked: boolean): Promise<Moment> {
    await get(userId, momentId);
    if (liked) {
      await db.execute(sql`
        insert into moment_likes (moment_id, user_id) values (${momentId}, ${userId})
        on conflict do nothing
      `);
    } else {
      await db.execute(sql`
        delete from moment_likes where moment_id = ${momentId} and user_id = ${userId}
      `);
    }
    return get(userId, momentId);
  }

  async function addComment(userId: string, momentId: string, body: string): Promise<Moment> {
    await get(userId, momentId);
    await db.execute(sql`
      insert into moment_comments (moment_id, author_id, body)
      values (${momentId}, ${userId}, ${body})
    `);
    return get(userId, momentId);
  }

  /** Yorumu, yorumun sahibi veya paylaşımın sahibi silebilir. */
  async function removeComment(
    userId: string,
    momentId: string,
    commentId: string,
  ): Promise<Moment> {
    const removed = await db.execute(sql`
      delete from moment_comments mc
      using moments m
      where mc.id = ${commentId}
        and mc.moment_id = ${momentId}
        and m.id = mc.moment_id
        and (mc.author_id = ${userId} or m.author_id = ${userId})
    `);
    if (removed === 0) throw new AppError("moment_not_found");
    return get(userId, momentId);
  }

  return { listFeed, create, remove, setLiked, addComment, removeComment };
}

export type MomentService = ReturnType<typeof createMomentService>;
