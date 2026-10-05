import type {
  Contact,
  ContactRequest,
  ContactRequests,
  CreateContactRequestResponse,
  UserRef,
} from "@vado/contracts";

import type { AppContext } from "../../core/context";
import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { toUserRef, type UserRefRow } from "../users/user-rows";
import { areContacts, isBlockedEitherWay } from "./relations";

interface ContactRow extends UserRefRow {
  username: string | null;
  bio: string;
  since: Date;
}

interface RequestRow extends UserRefRow {
  request_id: string;
  message: string;
  created_at: Date;
}

/** Karşılıklı kişilik ilişkisini kurar; ilişki zaten varsa bir şey yapmaz. */
async function linkContacts(db: Database, userId: string, otherId: string): Promise<void> {
  await db.execute(sql`
    insert into contacts (user_id, contact_id)
    values (${userId}, ${otherId}), (${otherId}, ${userId})
    on conflict do nothing
  `);
}

export function createContactService({ db, storage, realtime }: AppContext) {
  function toRequest(row: RequestRow): ContactRequest {
    return {
      id: row.request_id,
      user: toUserRef(row, storage),
      message: row.message,
      createdAt: row.created_at.toISOString(),
    };
  }

  async function list(userId: string): Promise<Contact[]> {
    const rows = await db.many<ContactRow>(sql`
      select r.id, r.display_name, r.status, r.avatar_key, u.username, u.bio, c.created_at as since
      from contacts c
      join users u on u.id = c.contact_id
      join user_refs r on r.id = u.id
      where c.user_id = ${userId}
      order by c.created_at desc
    `);
    return rows.map((row) => ({
      ...toUserRef(row, storage),
      username: row.username,
      bio: row.bio,
      since: row.since.toISOString(),
    }));
  }

  async function remove(userId: string, contactId: string): Promise<void> {
    const removed = await db.execute(sql`
      delete from contacts
      where (user_id = ${userId} and contact_id = ${contactId})
         or (user_id = ${contactId} and contact_id = ${userId})
    `);
    if (removed === 0) throw new AppError("not_contacts");
    realtime.emit([userId, contactId], "contacts:changed");
  }

  async function listRequests(userId: string): Promise<ContactRequests> {
    const [incoming, outgoing] = await Promise.all([
      db.many<RequestRow>(sql`
        select r.id, r.display_name, r.status, r.avatar_key,
               cr.id as request_id, cr.message, cr.created_at
        from contact_requests cr
        join user_refs r on r.id = cr.from_user_id
        where cr.to_user_id = ${userId}
        order by cr.created_at desc
      `),
      db.many<RequestRow>(sql`
        select r.id, r.display_name, r.status, r.avatar_key,
               cr.id as request_id, cr.message, cr.created_at
        from contact_requests cr
        join user_refs r on r.id = cr.to_user_id
        where cr.from_user_id = ${userId}
        order by cr.created_at desc
      `),
    ]);
    return { incoming: incoming.map(toRequest), outgoing: outgoing.map(toRequest) };
  }

  /**
   * Kişi isteği gönderir. Karşı taraf daha önce istek göndermişse yeni istek açmak yerine
   * o istek kabul edilir ve iki kullanıcı doğrudan kişi olur.
   */
  async function sendRequest(
    userId: string,
    targetId: string,
    message: string,
  ): Promise<CreateContactRequestResponse> {
    if (targetId === userId) throw new AppError("cannot_target_self");

    const target = await db.maybeOne(sql`
      select 1 from users where id = ${targetId} and status = 'active'
    `);
    if (target === null) throw new AppError("user_not_found");
    if (await isBlockedEitherWay(db, userId, targetId)) throw new AppError("user_unavailable");
    if (await areContacts(db, userId, targetId)) throw new AppError("already_contacts");

    const result = await db.transaction(async (tx): Promise<CreateContactRequestResponse> => {
      const reverse = await tx.execute(sql`
        delete from contact_requests
        where from_user_id = ${targetId} and to_user_id = ${userId}
      `);
      if (reverse > 0) {
        await linkContacts(tx, userId, targetId);
        return { status: "accepted", requestId: null };
      }
      const request = await tx.one<{ id: string }>(sql`
        insert into contact_requests (from_user_id, to_user_id, message)
        values (${userId}, ${targetId}, ${message})
        on conflict on constraint contact_requests_pair_key
        do update set message = excluded.message, created_at = now()
        returning id
      `);
      return { status: "pending", requestId: request.id };
    });

    realtime.emit([userId, targetId], "contacts:changed");
    return result;
  }

  async function acceptRequest(userId: string, requestId: string): Promise<UserRef> {
    const contact = await db.transaction(async (tx) => {
      const request = await tx.maybeOne<{ from_user_id: string }>(sql`
        delete from contact_requests
        where id = ${requestId} and to_user_id = ${userId}
        returning from_user_id
      `);
      if (request === null) throw new AppError("contact_request_not_found");
      await linkContacts(tx, userId, request.from_user_id);
      return tx.one<UserRefRow>(sql`
        select id, display_name, status, avatar_key from user_refs
        where id = ${request.from_user_id}
      `);
    });

    realtime.emit([userId, contact.id], "contacts:changed");
    return toUserRef(contact, storage);
  }

  /** Gelen isteği reddeder veya giden isteği geri çeker; iki durumda da istek silinir. */
  async function dismissRequest(userId: string, requestId: string): Promise<void> {
    const request = await db.maybeOne<{ from_user_id: string; to_user_id: string }>(sql`
      delete from contact_requests
      where id = ${requestId} and (to_user_id = ${userId} or from_user_id = ${userId})
      returning from_user_id, to_user_id
    `);
    if (request === null) throw new AppError("contact_request_not_found");
    realtime.emit([request.from_user_id, request.to_user_id], "contacts:changed");
  }

  async function listBlocked(userId: string): Promise<UserRef[]> {
    const rows = await db.many<UserRefRow>(sql`
      select r.id, r.display_name, r.status, r.avatar_key
      from blocks b
      join user_refs r on r.id = b.blocked_id
      where b.user_id = ${userId}
      order by b.created_at desc
    `);
    return rows.map((row) => toUserRef(row, storage));
  }

  /** Kullanıcıyı engeller: kişilik ilişkisi ve bekleyen istekler iki yönde de kaldırılır. */
  async function block(userId: string, targetId: string): Promise<void> {
    if (targetId === userId) throw new AppError("cannot_target_self");
    const target = await db.maybeOne(sql`select 1 from users where id = ${targetId}`);
    if (target === null) throw new AppError("user_not_found");

    await db.transaction(async (tx) => {
      await tx.execute(sql`
        insert into blocks (user_id, blocked_id) values (${userId}, ${targetId})
        on conflict do nothing
      `);
      await tx.execute(sql`
        delete from contacts
        where (user_id = ${userId} and contact_id = ${targetId})
           or (user_id = ${targetId} and contact_id = ${userId})
      `);
      await tx.execute(sql`
        delete from contact_requests
        where (from_user_id = ${userId} and to_user_id = ${targetId})
           or (from_user_id = ${targetId} and to_user_id = ${userId})
      `);
    });
    realtime.emit([userId, targetId], "contacts:changed");
  }

  async function unblock(userId: string, targetId: string): Promise<void> {
    await db.execute(sql`
      delete from blocks where user_id = ${userId} and blocked_id = ${targetId}
    `);
  }

  return {
    list,
    remove,
    listRequests,
    sendRequest,
    acceptRequest,
    dismissRequest,
    listBlocked,
    block,
    unblock,
  };
}

export type ContactService = ReturnType<typeof createContactService>;
