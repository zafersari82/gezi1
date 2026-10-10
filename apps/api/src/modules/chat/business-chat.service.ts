import type { BusinessChatOrder, BusinessChatReply, Message, PageQuery } from "@vado/contracts";

import { recordAudit } from "../../core/audit";
import type { AppContext } from "../../core/context";
import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { requireBusinessRole, type TenantScope, withTenant } from "../../core/tenant-scope";
import { withUser } from "../../core/user-scope";
import type { NotificationService } from "../notifications/notifications.service";

interface ThreadRow {
  conversation_id: string;
  customer_name: string;
  last_body: string | null;
  last_seq: number | null;
  last_at: Date | null;
  created_at: Date;
  unread_count: number;
}
interface MessageRow {
  id: string;
  seq: number;
  conversation_id: string;
  sender_id: string | null;
  body: string;
  created_at: Date;
  client_id: string | null;
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    seq: row.seq,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    kind: "text",
    body: row.body,
    imageUrl: null,
    clientId: row.client_id,
    createdAt: row.created_at.toISOString(),
  };
}

interface OrderCardRow {
  id: string;
  business_id: string;
  branch_id: string;
  branch_name: string;
  status: string;
  total_minor: number;
  currency: string;
  created_at: Date;
  updated_at: Date;
}
function orderCard(row: OrderCardRow): BusinessChatOrder {
  if (row.currency !== "TRY") throw new Error("Desteklenmeyen sipariş para birimi");
  return {
    id: row.id,
    businessId: row.business_id,
    branchId: row.branch_id,
    branchName: row.branch_name,
    status: row.status,
    totalMinor: row.total_minor,
    currency: "TRY",
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Ortak mesaj tabloları kullanılır; işyeri yetkisi her istekte veritabanında yeniden doğrulanır. */
export function createBusinessChatService(
  { db, realtime }: AppContext,
  { notifications }: { notifications: NotificationService },
) {
  async function open(userId: string, businessId: string): Promise<{ conversationId: string }> {
    return withUser(db, userId, async (tx) => {
      const eligible = await tx.maybeOne(sql`
        select 1 from businesses b join users owner on owner.id=b.owner_id
        where b.id=${businessId} and b.status='active' and b.verified
          and owner.status='active' for share of b, owner
      `);
      if (eligible === null) throw new AppError("business_not_found");
      // Aynı müşteri aynı işletmeye eşzamanlı iki cihazdan yazarsa tek sohbet oluşturulur.
      await tx.execute(sql`
        select pg_advisory_xact_lock(hashtextextended(${businessId}::text || ':' || ${userId}::text, 0))
      `);
      const existing = await tx.maybeOne<{ conversation_id: string }>(sql`
        select conversation_id from business_chat_threads
        where customer_id=${userId} and business_id=${businessId}
      `);
      if (existing !== null) return { conversationId: existing.conversation_id };
      const conversation = await tx.one<{ id: string }>(sql`
        insert into conversations(kind, title, created_by)
        select 'business', b.name, ${userId} from businesses b where b.id=${businessId}
        returning id
      `);
      await tx.execute(sql`
        insert into conversation_members(conversation_id,user_id)
        values(${conversation.id},${userId})
      `);
      await tx.execute(sql`
        insert into business_chat_threads(conversation_id,business_id,customer_id)
        values(${conversation.id},${businessId},${userId})
      `);
      return { conversationId: conversation.id };
    });
  }

  /** İşletme gelen kutusunda yalnız mevcut, etkin üyelikten gelen kapsam kullanılır. */
  async function inbox(scope: TenantScope, page: PageQuery) {
    requireBusinessRole(scope, ["owner", "manager"]);
    return withTenant(db, scope, async (tx) => {
      const rows = await tx.many<ThreadRow>(sql`
        select t.conversation_id, coalesce(nullif(u.display_name,''),'VADO kullanıcısı') as customer_name,
          lm.body as last_body, lm.seq as last_seq, lm.created_at as last_at,
          t.created_at,
          (select count(*) from messages m where m.conversation_id=t.conversation_id
            and m.seq > t.last_business_read_seq and m.sender_id=t.customer_id) as unread_count
        from business_chat_threads t
        join users u on u.id=t.customer_id and u.status='active'
        join lateral (select m.seq, m.body, m.created_at from messages m
          where m.conversation_id=t.conversation_id
          order by m.seq desc limit 1) lm on true
        where t.business_id=${scope.businessId}
          ${page.cursor === undefined ? sql.empty : sql`and lm.seq < ${page.cursor}::bigint`}
        order by lm.seq desc limit ${page.limit + 1}
      `);
      const visible = rows.slice(0, page.limit);
      return {
        items: visible.map((row) => ({
          conversationId: row.conversation_id,
          customerName: row.customer_name,
          lastMessage: row.last_body,
          updatedAt: (row.last_at ?? row.created_at).toISOString(),
          unreadCount: row.unread_count,
        })),
        nextCursor: rows.length > page.limit ? String(visible[visible.length - 1]?.last_seq) : null,
      };
    });
  }

  async function requireThread(tx: Database, scope: TenantScope, conversationId: string) {
    const thread = await tx.maybeOne<{ customer_id: string }>(sql`
      select t.customer_id from business_chat_threads t
      join businesses b on b.id=t.business_id
      join users owner on owner.id=b.owner_id
      where t.conversation_id=${conversationId} and t.business_id=${scope.businessId}
        and b.status='active' and b.verified and owner.status='active'
      for share of t
    `);
    if (thread === null) throw new AppError("conversation_not_found");
    return thread;
  }

  async function messages(scope: TenantScope, conversationId: string, page: PageQuery) {
    requireBusinessRole(scope, ["owner", "manager"]);
    return withTenant(db, scope, async (tx) => {
      const thread = await requireThread(tx, scope, conversationId);
      const rows = await tx.many<MessageRow>(sql`
        select m.id, m.seq, m.conversation_id, m.sender_id, m.body, m.created_at, m.client_id
        from messages m where m.conversation_id=${conversationId}
          and m.kind='text'
          ${page.cursor === undefined ? sql.empty : sql`and m.seq < ${page.cursor}::bigint`}
        order by m.seq desc limit ${page.limit + 1}
      `);
      const visible = rows.slice(0, page.limit);
      return {
        items: visible.map((row) => ({
          ...toMessage(row),
          fromCustomer: row.sender_id === thread.customer_id,
        })),
        nextCursor: rows.length > page.limit ? String(visible[visible.length - 1]?.seq) : null,
      };
    });
  }

  async function reply(scope: TenantScope, conversationId: string, body: BusinessChatReply) {
    requireBusinessRole(scope, ["owner", "manager"]);
    const result = await withTenant(db, scope, async (tx) => {
      const thread = await requireThread(tx, scope, conversationId);
      const row = await tx.maybeOne<MessageRow>(sql`
        insert into messages(conversation_id,sender_id,kind,body,client_id)
        values(${conversationId},${scope.userId},'text',${body.body},${body.clientId})
        on conflict on constraint messages_client_key do nothing
        returning id, seq, conversation_id, sender_id, body, created_at, client_id
      `);
      if (row === null) {
        const previous = await tx.maybeOne<MessageRow>(sql`
          select id,seq,conversation_id,sender_id,body,created_at,client_id
          from messages where sender_id=${scope.userId} and client_id=${body.clientId}
        `);
        if (previous?.conversation_id !== conversationId || previous.body !== body.body)
          throw new AppError("idempotency_conflict");
        return {
          message: { ...toMessage(previous), fromCustomer: false },
          customerId: thread.customer_id,
          eventId: null,
          duplicate: true,
        };
      }
      const eventId = await notifications.enqueueMessage(tx, {
        messageId: row.id,
        conversationId,
        senderId: scope.userId,
        kind: "text",
        body: row.body,
      });
      await recordAudit(tx, {
        actor: scope.userId,
        action: "business_chat.replied",
        targetType: "business_chat",
        targetId: conversationId,
        metadata: { businessId: scope.businessId, messageId: row.id },
      });
      return {
        message: { ...toMessage(row), fromCustomer: false },
        customerId: thread.customer_id,
        eventId,
        duplicate: false,
      };
    });
    if (!result.duplicate) {
      realtime.emit([result.customerId], "message:new", {
        conversationId,
        message: { ...result.message, senderId: null },
      });
      notifications.kick(result.eventId);
    }
    return result.message;
  }

  async function markRead(scope: TenantScope, conversationId: string): Promise<{ ok: boolean }> {
    requireBusinessRole(scope, ["owner", "manager"]);
    await withTenant(db, scope, async (tx) => {
      await requireThread(tx, scope, conversationId);
      await tx.execute(sql`
        update business_chat_threads t set last_business_read_seq=(
          select coalesce(max(m.seq),0) from messages m
          where m.conversation_id=${conversationId} and m.sender_id=t.customer_id
        ) where t.conversation_id=${conversationId} and t.business_id=${scope.businessId}
      `);
    });
    return { ok: true };
  }

  /** Yalnız bu konuşmanın müşterisine ait siparişler. İşletme bağlamı önce doğrulanır. */
  async function customerOrderRecords(
    userId: string,
    conversationId: string,
    orderId?: string,
  ): Promise<BusinessChatOrder[]> {
    return withUser(db, userId, async (tx) => {
      const thread = await tx.maybeOne<{ business_id: string }>(sql`
        select t.business_id from business_chat_threads t
        where t.conversation_id=${conversationId} and t.customer_id=${userId}
      `);
      if (thread === null) throw new AppError("conversation_not_found");
      await tx.execute(sql`select set_config('vado.business_id', ${thread.business_id}, true)`);
      return tx
        .many<{
          id: string;
          business_id: string;
          branch_id: string;
          branch_name: string;
          status: string;
          total_minor: number;
          currency: string;
          created_at: Date;
          updated_at: Date;
        }>(
          sql`
        select o.id, o.business_id, o.branch_id, br.name as branch_name,
          o.status, o.total_minor, o.currency, o.created_at, o.updated_at
        from orders o
        join business_customers bc on bc.business_id=o.business_id and bc.id=o.business_customer_id
        join branches br on br.business_id=o.business_id and br.id=o.branch_id
        where o.business_id=${thread.business_id} and bc.user_id=${userId}
          ${orderId === undefined ? sql.empty : sql`and o.id=${orderId}`}
        order by o.created_at desc, o.id desc limit ${orderId === undefined ? 20 : 1}
      `,
        )
        .then((rows) => rows.map(orderCard));
    });
  }

  function customerOrders(userId: string, conversationId: string) {
    return customerOrderRecords(userId, conversationId).then((items) => ({ items }));
  }

  async function customerOrder(userId: string, conversationId: string, orderId: string) {
    const [order] = await customerOrderRecords(userId, conversationId, orderId);
    if (!order) throw new AppError("not_found");
    return order;
  }

  /** İşletme panelindeki önizleme de müşterinin bu konuşmadaki siparişiyle sınırlıdır. */
  async function businessOrder(scope: TenantScope, conversationId: string, orderId: string) {
    requireBusinessRole(scope, ["owner", "manager"]);
    return withTenant(db, scope, async (tx) => {
      const thread = await requireThread(tx, scope, conversationId);
      const row = await tx.maybeOne<{
        id: string;
        business_id: string;
        branch_id: string;
        branch_name: string;
        status: string;
        total_minor: number;
        currency: string;
        created_at: Date;
        updated_at: Date;
      }>(sql`
        select o.id, o.business_id, o.branch_id, br.name as branch_name,
          o.status, o.total_minor, o.currency, o.created_at, o.updated_at
        from orders o
        join business_customers bc on bc.business_id=o.business_id and bc.id=o.business_customer_id
        join branches br on br.business_id=o.business_id and br.id=o.branch_id
        where o.business_id=${scope.businessId} and o.id=${orderId} and bc.user_id=${thread.customer_id}
      `);
      if (row === null) throw new AppError("not_found");
      return orderCard(row);
    });
  }

  return { open, inbox, messages, reply, markRead, customerOrders, customerOrder, businessOrder };
}
