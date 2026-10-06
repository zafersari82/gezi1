import {
  type Conversation,
  type ConversationDetail,
  type ConversationKind,
  type ConversationMember,
  type CreateGroupConversationBody,
  GROUP_MEMBERS_MAX,
  type MemberRole,
  type Message,
  type MessageKind,
  type Page,
  type PageQuery,
  type SendMessageBody,
  type UserStatus,
} from "@vado/contracts";

import type { AppContext } from "../../core/context";
import { type Database, sql, type SqlFragment } from "../../core/database";
import { AppError } from "../../core/errors";
import { areContacts, filterContacts } from "../contacts/relations";
import { requireOwnedMedia } from "../media/media.service";
import type { NotificationService } from "../notifications/notifications.service";
import { DELETED_USER, displayNameOf, toUserRef, type UserRefRow } from "../users/user-rows";

/**
 * Sistem mesajının anlattığı olay. Mesajın metni saklanmaz, okunurken olaydan üretilir;
 * böylece ad değişikliği ve hesap silme eski sistem mesajlarına da yansır.
 */
type SystemEvent =
  | { type: "group_created"; actorId: string }
  | { type: "group_renamed"; actorId: string; title: string }
  | { type: "members_added"; actorId: string; memberIds: string[] }
  | { type: "member_removed"; actorId: string; memberId: string }
  | { type: "member_left"; memberId: string };

/** Kullanıcı kimliği → başkalarına gösterilen ad. */
type Names = ReadonlyMap<string, string>;

/** Kullanıcı mesajlarında ad geçmez; sistem olayı taşımayan satırlar bu boş eşlemeyle çevrilir. */
const NO_NAMES: Names = new Map();

interface MessageRow {
  id: string;
  seq: number;
  conversation_id: string;
  sender_id: string | null;
  kind: MessageKind;
  body: string;
  system_event: SystemEvent | null;
  media_key: string | null;
  client_id: string | null;
  created_at: Date;
}

interface ConversationRow {
  id: string;
  kind: ConversationKind;
  title: string | null;
  created_at: Date;
  member_count: number;
  unread_count: number;
  peer_id: string | null;
  peer_display_name: string | null;
  peer_status: UserStatus | null;
  peer_avatar_key: string | null;
  last_id: string | null;
  last_seq: number | null;
  last_sender_id: string | null;
  last_kind: MessageKind | null;
  last_body: string | null;
  last_system_event: SystemEvent | null;
  last_media_key: string | null;
  last_client_id: string | null;
  last_created_at: Date | null;
  last_sender_display_name: string | null;
  last_sender_status: UserStatus | null;
}

interface MemberRow extends UserRefRow {
  role: MemberRole;
  last_read_seq: number;
}

interface Membership {
  kind: ConversationKind;
  role: MemberRole;
}

/** `messages m` ve `media md` takma adlarıyla kullanılan ortak sütun listesi. */
const MESSAGE_COLUMNS = sql`
  m.id, m.seq, m.conversation_id, m.sender_id, m.kind, m.body, m.system_event,
  md.storage_key as media_key, m.client_id, m.created_at
`;

function userIdsOf(event: SystemEvent): string[] {
  switch (event.type) {
    case "group_created":
    case "group_renamed":
      return [event.actorId];
    case "members_added":
      return [event.actorId, ...event.memberIds];
    case "member_removed":
      return [event.actorId, event.memberId];
    case "member_left":
      return [event.memberId];
  }
}

/** Olayı sohbette gösterilecek cümleye çevirir. */
function describe(event: SystemEvent, names: Names): string {
  const nameOf = (userId: string) => names.get(userId) ?? DELETED_USER;
  switch (event.type) {
    case "group_created":
      return `${nameOf(event.actorId)} grubu oluşturdu`;
    case "group_renamed":
      return `${nameOf(event.actorId)} grup adını "${event.title}" olarak değiştirdi`;
    case "members_added":
      return `${nameOf(event.actorId)} şu kişileri ekledi: ${event.memberIds.map(nameOf).join(", ")}`;
    case "member_removed":
      return `${nameOf(event.actorId)}, ${nameOf(event.memberId)} adlı üyeyi gruptan çıkardı`;
    case "member_left":
      return `${nameOf(event.memberId)} gruptan ayrıldı`;
  }
}

/** Sistem olaylarında geçen kullanıcıların güncel adlarını okur. */
async function namesFor(db: Database, events: readonly (SystemEvent | null)[]): Promise<Names> {
  const userIds = [...new Set(events.flatMap((event) => (event === null ? [] : userIdsOf(event))))];
  if (userIds.length === 0) return NO_NAMES;
  const rows = await db.many<Pick<UserRefRow, "id" | "display_name" | "status">>(sql`
    select id, display_name, status from user_refs where id = any(${userIds}::uuid[])
  `);
  return new Map(rows.map((row) => [row.id, displayNameOf(row)]));
}

/** Birebir sohbetin anahtarı: iki kimliğin sıralı birleşimi. */
function directKeyOf(userId: string, peerId: string): string {
  return [userId, peerId].sort().join(":");
}

async function memberIdsOf(db: Database, conversationId: string): Promise<string[]> {
  const rows = await db.many<{ user_id: string }>(sql`
    select user_id from conversation_members where conversation_id = ${conversationId}
  `);
  return rows.map((row) => row.user_id);
}

async function insertSystemMessage(
  db: Database,
  conversationId: string,
  event: SystemEvent,
): Promise<MessageRow> {
  return db.one<MessageRow>(sql`
    with m as (
      insert into messages (conversation_id, kind, system_event)
      values (${conversationId}, 'system', ${JSON.stringify(event)}::jsonb)
      returning *
    )
    select ${MESSAGE_COLUMNS} from m left join media md on md.id = m.media_id
  `);
}

/**
 * Üyeyi gruptan çıkarır. Grup boş kalırsa silinir (`true` döner);
 * sahibi kalmayan grupta sahiplik en eski üyeye geçer.
 */
async function removeFromGroup(
  db: Database,
  conversationId: string,
  userId: string,
): Promise<boolean> {
  await db.execute(sql`
    delete from conversation_members
    where conversation_id = ${conversationId} and user_id = ${userId}
  `);
  const { members, owners } = await db.one<{ members: number; owners: number }>(sql`
    select count(*) as members, count(*) filter (where role = 'owner') as owners
    from conversation_members
    where conversation_id = ${conversationId}
  `);
  if (members === 0) {
    await db.execute(sql`delete from conversations where id = ${conversationId}`);
    return true;
  }
  if (owners === 0) {
    await db.execute(sql`
      update conversation_members
      set role = 'owner'
      where conversation_id = ${conversationId}
        and user_id = (
          select user_id from conversation_members
          where conversation_id = ${conversationId}
          order by joined_at, user_id
          limit 1
        )
    `);
  }
  return false;
}

export function createChatService(
  { db, storage, realtime }: AppContext,
  { notifications }: { notifications: NotificationService },
) {
  function toMessage(row: MessageRow, names: Names): Message {
    return {
      id: row.id,
      seq: row.seq,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      kind: row.kind,
      body: row.system_event === null ? row.body : describe(row.system_event, names),
      imageUrl: row.media_key === null ? null : storage.publicUrl(row.media_key),
      clientId: row.client_id,
      createdAt: row.created_at.toISOString(),
    };
  }

  function toConversation(row: ConversationRow, names: Names): Conversation {
    const isDirect = row.kind === "direct";
    const peerName = displayNameOf({
      display_name: row.peer_display_name,
      status: row.peer_status ?? "deleted",
    });
    const lastMessage =
      row.last_id === null || row.last_seq === null || row.last_kind === null
        ? null
        : {
            ...toMessage(
              {
                id: row.last_id,
                seq: row.last_seq,
                conversation_id: row.id,
                sender_id: row.last_sender_id,
                kind: row.last_kind,
                body: row.last_body ?? "",
                system_event: row.last_system_event,
                media_key: row.last_media_key,
                client_id: row.last_client_id,
                created_at: row.last_created_at ?? row.created_at,
              },
              names,
            ),
            senderName:
              row.last_sender_status === null
                ? null
                : displayNameOf({
                    display_name: row.last_sender_display_name,
                    status: row.last_sender_status,
                  }),
          };

    return {
      id: row.id,
      kind: row.kind,
      title: isDirect ? peerName : (row.title ?? ""),
      avatarUrl:
        isDirect && row.peer_avatar_key !== null ? storage.publicUrl(row.peer_avatar_key) : null,
      peerId: row.peer_id,
      memberCount: row.member_count,
      lastMessage,
      unreadCount: row.unread_count,
      updatedAt: (row.last_created_at ?? row.created_at).toISOString(),
    };
  }

  /** Kullanıcının sohbet(ler)ini son mesaj, okunmamış sayısı ve karşı taraf bilgisiyle okur. */
  function conversationQuery(userId: string, filter: SqlFragment): SqlFragment {
    return sql`
      select
        c.id,
        c.kind,
        c.title,
        c.created_at,
        (
          select count(*) from conversation_members cm where cm.conversation_id = c.id
        ) as member_count,
        (
          select count(*) from messages m
          where m.conversation_id = c.id
            and m.seq > me.last_read_seq
            and m.kind <> 'system'
            and m.sender_id is distinct from ${userId}
        ) as unread_count,
        peer.id as peer_id,
        peer.display_name as peer_display_name,
        peer.status as peer_status,
        peer.avatar_key as peer_avatar_key,
        lm.id as last_id,
        lm.seq as last_seq,
        lm.sender_id as last_sender_id,
        lm.kind as last_kind,
        lm.body as last_body,
        lm.system_event as last_system_event,
        lm.media_key as last_media_key,
        lm.client_id as last_client_id,
        lm.created_at as last_created_at,
        sender.display_name as last_sender_display_name,
        sender.status as last_sender_status
      from conversation_members me
      join conversations c on c.id = me.conversation_id
      left join lateral (
        select r.*
        from conversation_members other
        join user_refs r on r.id = other.user_id
        where c.kind = 'direct'
          and other.conversation_id = c.id
          and other.user_id <> me.user_id
        limit 1
      ) peer on true
      left join lateral (
        select m.*, md.storage_key as media_key
        from messages m
        left join media md on md.id = m.media_id
        where m.conversation_id = c.id
        order by m.seq desc
        limit 1
      ) lm on true
      left join user_refs sender on sender.id = lm.sender_id
      where me.user_id = ${userId} and ${filter}
      order by coalesce(lm.seq, 0) desc, c.created_at desc
    `;
  }

  async function requireMember(userId: string, conversationId: string): Promise<Membership> {
    const membership = await db.maybeOne<Membership>(sql`
      select c.kind, cm.role
      from conversation_members cm
      join conversations c on c.id = cm.conversation_id
      where cm.conversation_id = ${conversationId} and cm.user_id = ${userId}
    `);
    if (membership === null) throw new AppError("conversation_not_found");
    return membership;
  }

  async function requireGroupMember(userId: string, conversationId: string): Promise<Membership> {
    const membership = await requireMember(userId, conversationId);
    if (membership.kind !== "group") throw new AppError("group_only");
    return membership;
  }

  /** Sistem mesajını ve liste değişikliğini verilen kullanıcılara duyurur. */
  async function announce(recipients: readonly string[], row: MessageRow | null): Promise<void> {
    if (row !== null) {
      realtime.emit(recipients, "message:new", {
        conversationId: row.conversation_id,
        message: toMessage(row, await namesFor(db, [row.system_event])),
      });
    }
    realtime.emit(recipients, "conversations:changed");
  }

  /** Sohbet listesi. Henüz mesaj yazılmamış birebir sohbetler listede görünmez. */
  async function listConversations(userId: string): Promise<Conversation[]> {
    const rows = await db.many<ConversationRow>(
      conversationQuery(userId, sql`(c.kind = 'group' or lm.id is not null)`),
    );
    const names = await namesFor(
      db,
      rows.map((row) => row.last_system_event),
    );
    return rows.map((row) => toConversation(row, names));
  }

  async function getConversation(
    userId: string,
    conversationId: string,
  ): Promise<ConversationDetail> {
    const row = await db.maybeOne<ConversationRow>(
      conversationQuery(userId, sql`c.id = ${conversationId}`),
    );
    if (row === null) throw new AppError("conversation_not_found");

    const members = await db.many<MemberRow>(sql`
      select r.id, r.display_name, r.status, r.avatar_key, cm.role, cm.last_read_seq
      from conversation_members cm
      join user_refs r on r.id = cm.user_id
      where cm.conversation_id = ${conversationId}
      order by cm.joined_at, r.id
    `);
    return {
      ...toConversation(row, await namesFor(db, [row.last_system_event])),
      members: members.map((member): ConversationMember => ({
        ...toUserRef(member, storage),
        role: member.role,
        lastReadSeq: member.last_read_seq,
      })),
    };
  }

  /** Bir kişiyle birebir sohbeti açar; sohbet zaten varsa onu döndürür. */
  async function openDirect(userId: string, peerId: string): Promise<ConversationDetail> {
    if (peerId === userId) throw new AppError("cannot_target_self");
    if (!(await areContacts(db, userId, peerId))) throw new AppError("not_contacts");

    const directKey = directKeyOf(userId, peerId);
    const conversationId = await db.transaction(async (tx) => {
      const created = await tx.maybeOne<{ id: string }>(sql`
        insert into conversations (kind, direct_key, created_by)
        values ('direct', ${directKey}, ${userId})
        on conflict (direct_key) do nothing
        returning id
      `);
      if (created === null) {
        const existing = await tx.one<{ id: string }>(sql`
          select id from conversations where direct_key = ${directKey}
        `);
        return existing.id;
      }
      await tx.execute(sql`
        insert into conversation_members (conversation_id, user_id)
        values (${created.id}, ${userId}), (${created.id}, ${peerId})
      `);
      return created.id;
    });
    return getConversation(userId, conversationId);
  }

  /** Grup kurar. Kurucu grubun sahibi olur; eklenen herkes kurucunun kişisi olmalıdır. */
  async function createGroup(
    userId: string,
    body: CreateGroupConversationBody,
  ): Promise<ConversationDetail> {
    const memberIds = [...new Set(body.memberIds)].filter((id) => id !== userId);
    if (memberIds.length === 0) throw new AppError("validation_failed");
    const contacts = await filterContacts(db, userId, memberIds);
    if (contacts.length !== memberIds.length) throw new AppError("not_contacts");

    const { conversationId, message } = await db.transaction(async (tx) => {
      const conversation = await tx.one<{ id: string }>(sql`
        insert into conversations (kind, title, created_by)
        values ('group', ${body.title}, ${userId})
        returning id
      `);
      await tx.execute(sql`
        insert into conversation_members (conversation_id, user_id, role)
        select ${conversation.id}, member.id, case when member.id = ${userId} then 'owner' else 'member' end
        from unnest(${[userId, ...memberIds]}::uuid[]) as member (id)
      `);
      const system = await insertSystemMessage(tx, conversation.id, {
        type: "group_created",
        actorId: userId,
      });
      return { conversationId: conversation.id, message: system };
    });

    await announce([userId, ...memberIds], message);
    return getConversation(userId, conversationId);
  }

  /** Grubun adını değiştirir; yalnızca grup sahibi yapabilir. */
  async function renameGroup(
    userId: string,
    conversationId: string,
    title: string,
  ): Promise<ConversationDetail> {
    const membership = await requireGroupMember(userId, conversationId);
    if (membership.role !== "owner") throw new AppError("not_group_owner");

    const message = await db.transaction(async (tx) => {
      await tx.execute(sql`update conversations set title = ${title} where id = ${conversationId}`);
      return insertSystemMessage(tx, conversationId, {
        type: "group_renamed",
        actorId: userId,
        title,
      });
    });

    await announce(await memberIdsOf(db, conversationId), message);
    return getConversation(userId, conversationId);
  }

  /** Gruba üye ekler. Her üye kendi kişilerini ekleyebilir. */
  async function addMembers(
    userId: string,
    conversationId: string,
    userIds: readonly string[],
  ): Promise<ConversationDetail> {
    await requireGroupMember(userId, conversationId);

    const current = await memberIdsOf(db, conversationId);
    const candidates = [...new Set(userIds)].filter((id) => !current.includes(id));
    if (candidates.length > 0) {
      const contacts = await filterContacts(db, userId, candidates);
      if (contacts.length !== candidates.length) throw new AppError("not_contacts");
      if (current.length + candidates.length > GROUP_MEMBERS_MAX) throw new AppError("group_full");

      const message = await db.transaction(async (tx) => {
        await tx.execute(sql`
          insert into conversation_members (conversation_id, user_id)
          select ${conversationId}, member.id from unnest(${candidates}::uuid[]) as member (id)
          on conflict do nothing
        `);
        return insertSystemMessage(tx, conversationId, {
          type: "members_added",
          actorId: userId,
          memberIds: candidates,
        });
      });
      await announce([...current, ...candidates], message);
    }
    return getConversation(userId, conversationId);
  }

  /**
   * Üyeyi gruptan çıkarır. Kullanıcı kendini çıkarırsa gruptan ayrılmış olur;
   * başkasını yalnızca grup sahibi çıkarabilir.
   */
  async function removeMember(
    userId: string,
    conversationId: string,
    targetId: string,
  ): Promise<void> {
    const membership = await requireGroupMember(userId, conversationId);
    const leaving = targetId === userId;
    if (!leaving && membership.role !== "owner") throw new AppError("not_group_owner");

    const before = await memberIdsOf(db, conversationId);
    if (!before.includes(targetId)) throw new AppError("user_not_found");

    const event: SystemEvent = leaving
      ? { type: "member_left", memberId: userId }
      : { type: "member_removed", actorId: userId, memberId: targetId };

    const message = await db.transaction(async (tx) => {
      const deleted = await removeFromGroup(tx, conversationId, targetId);
      return deleted ? null : insertSystemMessage(tx, conversationId, event);
    });
    await announce(before, message);
  }

  /** Kullanıcıyı üyesi olduğu tüm gruplardan çıkarır (hesap silinirken çağrılır). */
  async function leaveAllGroups(tx: Database, userId: string): Promise<void> {
    const groups = await tx.many<{ id: string }>(sql`
      select c.id
      from conversation_members cm
      join conversations c on c.id = cm.conversation_id
      where cm.user_id = ${userId} and c.kind = 'group'
    `);
    for (const group of groups) {
      const deleted = await removeFromGroup(tx, group.id, userId);
      if (!deleted) {
        await insertSystemMessage(tx, group.id, { type: "member_left", memberId: userId });
      }
    }
  }

  /** Mesajları yeniden eskiye doğru sayfalar; imleç bir önceki sayfanın en eski mesajıdır. */
  async function listMessages(
    userId: string,
    conversationId: string,
    page: PageQuery,
  ): Promise<Page<Message>> {
    await requireMember(userId, conversationId);
    const rows = await db.many<MessageRow>(sql`
      select ${MESSAGE_COLUMNS}
      from messages m
      left join media md on md.id = m.media_id
      where m.conversation_id = ${conversationId}
        ${page.cursor === undefined ? sql.empty : sql`and m.seq < ${Number(page.cursor)}`}
      order by m.seq desc
      limit ${page.limit + 1}
    `);
    const names = await namesFor(
      db,
      rows.map((row) => row.system_event),
    );
    const items = rows.slice(0, page.limit).map((row) => toMessage(row, names));
    const last = items.at(-1);
    return {
      items,
      nextCursor: rows.length > page.limit && last !== undefined ? String(last.seq) : null,
    };
  }

  /**
   * Mesaj gönderir. Aynı `clientId` ile yinelenen istekte ilk kaydedilen mesaj döner;
   * böylece ağ hatasından sonra yeniden deneme mesajı çoğaltmaz.
   */
  async function sendMessage(
    userId: string,
    conversationId: string,
    body: SendMessageBody,
  ): Promise<Message> {
    const membership = await requireMember(userId, conversationId);
    const members = await memberIdsOf(db, conversationId);
    if (membership.kind === "direct") {
      const peerId = members.find((id) => id !== userId);
      if (peerId === undefined || !(await areContacts(db, userId, peerId))) {
        throw new AppError("not_contacts");
      }
    }
    if (body.kind === "image") await requireOwnedMedia(db, userId, [body.mediaId]);

    const { inserted, eventId, duplicate } = await db.transaction(async (tx) => {
      const inserted = await tx.maybeOne<MessageRow>(sql`
      with m as (
        insert into messages (conversation_id, sender_id, kind, body, media_id, client_id)
        values (
          ${conversationId},
          ${userId},
          ${body.kind},
          ${body.kind === "text" ? body.body : ""},
          ${body.kind === "image" ? body.mediaId : null},
          ${body.clientId}
        )
        on conflict on constraint messages_client_key do nothing
        returning *
      )
      select ${MESSAGE_COLUMNS} from m left join media md on md.id = m.media_id
    `);
      if (inserted === null) {
        const existing = await tx.one<MessageRow>(sql`
        select ${MESSAGE_COLUMNS}
        from messages m
        left join media md on md.id = m.media_id
        where m.sender_id = ${userId} and m.client_id = ${body.clientId}
      `);
        return { inserted: existing, eventId: null, duplicate: true };
      }

      await tx.execute(sql`
      update conversation_members
      set last_read_seq = ${inserted.seq}
      where conversation_id = ${conversationId}
        and user_id = ${userId}
        and last_read_seq < ${inserted.seq}
    `);

      const eventId = await notifications.enqueueMessage(tx, {
        messageId: inserted.id,
        conversationId,
        senderId: userId,
        kind: inserted.kind,
        body: inserted.body,
      });
      return { inserted, eventId, duplicate: false };
    });
    if (duplicate) return toMessage(inserted, NO_NAMES);

    const message = toMessage(inserted, NO_NAMES);
    realtime.emit(members, "message:new", { conversationId, message });
    notifications.kick(eventId);
    return message;
  }

  /** Sohbeti verilen sıra numarasına kadar okundu işaretler; okundu bilgisi geriye gitmez. */
  async function markRead(userId: string, conversationId: string, seq: number): Promise<void> {
    const updated = await db.maybeOne<{ last_read_seq: number }>(sql`
      update conversation_members
      set last_read_seq = greatest(
        last_read_seq,
        least(${seq}, (
          select coalesce(max(seq), 0) from messages where conversation_id = ${conversationId}
        ))
      )
      where conversation_id = ${conversationId} and user_id = ${userId}
      returning last_read_seq
    `);
    if (updated === null) throw new AppError("conversation_not_found");

    realtime.emit(await memberIdsOf(db, conversationId), "conversation:read", {
      conversationId,
      userId,
      lastReadSeq: updated.last_read_seq,
    });
  }

  /** "Yazıyor" bildiriminin alıcıları; gönderen üye değilse boş liste. */
  async function typingRecipients(userId: string, conversationId: string): Promise<string[]> {
    const members = await memberIdsOf(db, conversationId);
    return members.includes(userId) ? members.filter((id) => id !== userId) : [];
  }

  return {
    listConversations,
    getConversation,
    openDirect,
    createGroup,
    renameGroup,
    addMembers,
    removeMember,
    leaveAllGroups,
    listMessages,
    sendMessage,
    markRead,
    typingRecipients,
  };
}

export type ChatService = ReturnType<typeof createChatService>;
