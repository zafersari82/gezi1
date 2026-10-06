import {
  type Me,
  normalizePhone,
  type Relation,
  type UpdateMeBody,
  usernameSchema,
  type UserProfile,
} from "@vado/contracts";

import { recordAudit } from "../../core/audit";
import type { AppContext } from "../../core/context";
import { isUniqueViolation, sql, type SqlFragment } from "../../core/database";
import { AppError } from "../../core/errors";
import { platformScope } from "../../core/platform-scope";
import type { AuthService } from "../auth/auth.service";
import type { ChatService } from "../chat/chat.service";
import { deleteUnusedMedia, removeFiles, requireOwnedMedia } from "../media/media.service";
import { findMe, toUserRef, type UserRefRow } from "./user-rows";

interface ProfileRow extends UserRefRow {
  username: string | null;
  bio: string;
  is_contact: boolean;
  blocked_by_me: boolean;
  blocks_me: boolean;
  sent_request_id: string | null;
  received_request_id: string | null;
}

export function createUserService(
  { db, platformDb, storage, realtime }: AppContext,
  { auth, chat }: { auth: AuthService; chat: ChatService },
) {
  async function getMe(userId: string): Promise<Me> {
    const me = await findMe(db, storage, userId);
    if (me === null) throw new AppError("unauthorized");
    return me;
  }

  async function updateMe(userId: string, body: UpdateMeBody): Promise<Me> {
    if (body.avatarMediaId !== undefined && body.avatarMediaId !== null) {
      await requireOwnedMedia(db, userId, [body.avatarMediaId]);
    }

    const changes: SqlFragment[] = [];
    if (body.displayName !== undefined) changes.push(sql`display_name = ${body.displayName}`);
    if (body.username !== undefined) changes.push(sql`username = ${body.username}`);
    if (body.bio !== undefined) changes.push(sql`bio = ${body.bio}`);
    if (body.avatarMediaId !== undefined)
      changes.push(sql`avatar_media_id = ${body.avatarMediaId}`);
    if (body.discoverableByPhone !== undefined) {
      changes.push(sql`discoverable_by_phone = ${body.discoverableByPhone}`);
    }

    if (changes.length > 0) {
      try {
        // Profil fotoğrafı değiştiyse veya kaldırıldıysa eski fotoğraf da silinir.
        const unusedKeys = await db.transaction(async (tx) => {
          const before = await tx.one<{ avatar_media_id: string | null }>(sql`
            select avatar_media_id from users where id = ${userId} for update
          `);
          await tx.execute(sql`
            update users
            set ${sql.join(changes, ", ")}, updated_at = now()
            where id = ${userId}
          `);
          return before.avatar_media_id === null
            ? []
            : deleteUnusedMedia(tx, userId, [before.avatar_media_id]);
        });
        await removeFiles(storage, unusedKeys);
      } catch (error) {
        if (isUniqueViolation(error, "users_username_key")) throw new AppError("username_taken");
        throw error;
      }
    }
    return getMe(userId);
  }

  /**
   * Hesabı siler: kişisel veriler temizlenir; paylaşımlar, profil ve paylaşım fotoğrafları, kişi
   * ilişkileri ve grup üyelikleri kaldırılır. Gönderilmiş mesajlar (fotoğraflar dahil) karşı
   * tarafın sohbet geçmişinde "Silinmiş Hesap" adıyla kalır.
   */
  async function deleteMe(userId: string): Promise<void> {
    const { affectedUserIds, unusedKeys } = await platformScope(platformDb, async (tx) => {
      // Müşteri bağı kurma aynı kullanıcıyı önce kilitler; sıra silme yarışı ve kilit döngüsünü önler.
      await tx.execute(sql`select 1 from users where id = ${userId} for update`);
      await tx.execute(sql`update business_customers set user_id = null where user_id = ${userId}`);
      await tx.execute(sql`update business_members set active = false where user_id = ${userId}`);
      const related = await tx.many<{ id: string }>(sql`
        select contact_id as id from contacts where user_id = ${userId}
        union
        select cm.user_id as id
        from conversation_members cm
        where cm.user_id <> ${userId}
          and cm.conversation_id in (
            select conversation_id from conversation_members where user_id = ${userId}
          )
      `);

      await tx.execute(sql`
        delete from contacts where user_id = ${userId} or contact_id = ${userId}
      `);
      await tx.execute(sql`
        delete from contact_requests where from_user_id = ${userId} or to_user_id = ${userId}
      `);
      await tx.execute(sql`
        delete from blocks where user_id = ${userId} or blocked_id = ${userId}
      `);
      await tx.execute(sql`delete from moments where author_id = ${userId}`);
      await tx.execute(sql`delete from moment_likes where user_id = ${userId}`);
      await tx.execute(sql`delete from moment_comments where author_id = ${userId}`);

      await chat.leaveAllGroups(tx, userId);

      await tx.execute(sql`
        update businesses set status = 'suspended', updated_at = now() where owner_id = ${userId}
      `);
      await tx.execute(sql`
        update users
        set
          phone = null,
          display_name = null,
          username = null,
          bio = '',
          avatar_media_id = null,
          status = 'deleted',
          updated_at = now()
        where id = ${userId}
      `);
      await recordAudit(tx, {
        actor: userId,
        action: "user.deleted",
        targetType: "user",
        targetId: userId,
      });
      return {
        affectedUserIds: related.map((row) => row.id),
        unusedKeys: await deleteUnusedMedia(tx, userId),
      };
    });

    await removeFiles(storage, unusedKeys);
    await auth.revokeAllSessions(userId);
    realtime.emit(affectedUserIds, "contacts:changed");
    realtime.emit(affectedUserIds, "conversations:changed");
  }

  function relationOf(viewerId: string, row: ProfileRow): Relation {
    if (row.id === viewerId) return "self";
    if (row.blocked_by_me) return "blocked";
    if (row.is_contact) return "contact";
    if (row.sent_request_id !== null) return "request_sent";
    if (row.received_request_id !== null) return "request_received";
    return "none";
  }

  function toProfile(viewerId: string, row: ProfileRow): UserProfile {
    return {
      ...toUserRef(row, storage),
      username: row.username,
      bio: row.bio,
      relation: relationOf(viewerId, row),
      requestId: row.sent_request_id ?? row.received_request_id,
    };
  }

  /** Görüntüleyene göre ilişki bilgisiyle birlikte profili okur. Koşul bir `users u` süzgecidir. */
  async function findProfile(
    viewerId: string,
    condition: SqlFragment,
  ): Promise<UserProfile | null> {
    const row = await db.maybeOne<ProfileRow>(sql`
      select
        r.id,
        r.display_name,
        r.status,
        r.avatar_key,
        u.username,
        u.bio,
        exists (
          select 1 from contacts c where c.user_id = ${viewerId} and c.contact_id = u.id
        ) as is_contact,
        exists (
          select 1 from blocks b where b.user_id = ${viewerId} and b.blocked_id = u.id
        ) as blocked_by_me,
        exists (
          select 1 from blocks b where b.user_id = u.id and b.blocked_id = ${viewerId}
        ) as blocks_me,
        (
          select cr.id from contact_requests cr
          where cr.from_user_id = ${viewerId} and cr.to_user_id = u.id
        ) as sent_request_id,
        (
          select cr.id from contact_requests cr
          where cr.from_user_id = u.id and cr.to_user_id = ${viewerId}
        ) as received_request_id
      from users u
      join user_refs r on r.id = u.id
      where u.status = 'active' and ${condition}
    `);
    // Görüntüleyeni engellemiş bir kullanıcı, o kişi için hiç yokmuş gibi davranır.
    if (row === null || row.blocks_me) return null;
    return toProfile(viewerId, row);
  }

  async function getProfile(viewerId: string, userId: string): Promise<UserProfile> {
    const profile = await findProfile(viewerId, sql`u.id = ${userId}`);
    if (profile === null) throw new AppError("user_not_found");
    return profile;
  }

  /**
   * Telefon numarası veya VADO kimliğiyle tam eşleşme arar. Kısmi arama bilinçli olarak yoktur:
   * kullanıcı dizininin taranmasını engeller.
   */
  async function search(viewerId: string, query: string): Promise<UserProfile[]> {
    const phone = normalizePhone(query);
    const username = usernameSchema.safeParse(query.replace(/^@/, "").toLowerCase());

    let condition: SqlFragment;
    if (phone !== null) condition = sql`u.phone = ${phone} and u.discoverable_by_phone`;
    else if (username.success) condition = sql`u.username = ${username.data}`;
    else return [];

    const profile = await findProfile(viewerId, condition);
    return profile === null ? [] : [profile];
  }

  return { getMe, updateMe, deleteMe, getProfile, search };
}

export type UserService = ReturnType<typeof createUserService>;
