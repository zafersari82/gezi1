import { randomUUID } from "node:crypto";

import type { Logger } from "./context";
import { type Database, sql } from "./database";
import { platformScope } from "./platform-scope";

export interface OutboxEvent {
  id: string;
  businessId: string | null;
  aggregateId: string | null;
  orderId: string | null;
  sequence: number | null;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  lockId: string;
}

/** Tüketiciler yalnızca depoda incelenmiş koddan kurulur; manifestten işlev yüklenmez. */
export type OutboxConsumer = { name: string; types: readonly string[] } & (
  | { kind: "internal"; deliver: (tx: Database, event: OutboxEvent) => Promise<void> }
  | { kind: "external"; deliver: (event: OutboxEvent) => Promise<void> }
);

interface EventRow {
  id: string;
  business_id: string | null;
  aggregate_id: string | null;
  order_id: string | null;
  sequence: number | null;
  type: string;
  payload: Record<string, unknown>;
  attempts: number;
  lock_id: string;
}

export interface OutboxWorkerOptions {
  platformDb: Database;
  log: Logger;
  consumers: readonly OutboxConsumer[];
  leaseMs?: number;
  maxAttempts?: number;
  retryBaseMs?: number;
}

export function createOutboxWorker({
  platformDb,
  log,
  consumers,
  leaseMs = 30_000,
  maxAttempts = 8,
  retryBaseMs = 1000,
}: OutboxWorkerOptions) {
  if (leaseMs < 1 || maxAttempts < 1 || retryBaseMs < 0)
    throw new Error("Olay dağıtıcı ayarı geçersiz");
  if (new Set(consumers.map((consumer) => consumer.name)).size !== consumers.length)
    throw new Error("Tüketici adları tekil olmalıdır");
  const table = (event: OutboxEvent) =>
    event.businessId === null ? sql`platform_outbox_events` : sql`outbox_events`;

  async function lease(eventIds?: readonly string[]): Promise<OutboxEvent | null> {
    return platformScope(platformDb, async (tx) => {
      const filter = eventIds === undefined ? sql.empty : sql`and e.id = any(${eventIds}::uuid[])`;
      for (const tenant of [true, false]) {
        const source = tenant ? sql`outbox_events` : sql`platform_outbox_events`;
        const order = tenant
          ? sql`and not exists (select 1 from outbox_events prior
          where prior.business_id = e.business_id and prior.aggregate_id = e.aggregate_id
            and prior.sequence < e.sequence and prior.status <> 'delivered')`
          : sql.empty;
        const columns = tenant
          ? sql`e.business_id, e.aggregate_id, e.order_id, e.sequence`
          : sql`null::uuid as business_id, null::uuid as aggregate_id, null::uuid as order_id, null::bigint as sequence`;
        const row = await tx.maybeOne<EventRow>(sql`
          with ready as (
            select e.id from ${source} e where
              ((e.status = 'pending' and e.next_attempt_at <= now()) or (e.status = 'leased' and e.locked_until <= now()))
              ${filter} ${order} order by e.created_at, e.id for update skip locked limit 1
          )
          update ${source} e set status = 'leased', lock_id = ${randomUUID()},
            locked_until = now() + ${leaseMs} * interval '1 millisecond', attempts = attempts + 1
          from ready where e.id = ready.id returning e.id, ${columns}, e.type, e.payload, e.attempts, e.lock_id
        `);
        if (row !== null)
          return {
            id: row.id,
            businessId: row.business_id,
            aggregateId: row.aggregate_id,
            orderId: row.order_id,
            sequence: row.sequence,
            type: row.type,
            payload: row.payload,
            attempts: row.attempts,
            lockId: row.lock_id,
          };
      }
      return null;
    });
  }

  async function hasDelivery(tx: Database, event: OutboxEvent, consumer: string): Promise<boolean> {
    const source =
      event.businessId === null ? sql`platform_event_deliveries` : sql`event_deliveries`;
    return (
      (await tx.maybeOne(
        sql`select event_id from ${source} where event_id = ${event.id} and consumer = ${consumer}`,
      )) !== null
    );
  }

  async function recordDelivery(tx: Database, event: OutboxEvent, consumer: string): Promise<void> {
    if (event.businessId === null) {
      await tx.execute(
        sql`insert into platform_event_deliveries(event_id, consumer) values (${event.id}, ${consumer}) on conflict do nothing`,
      );
    } else {
      await tx.execute(
        sql`insert into event_deliveries(business_id, event_id, consumer) values (${event.businessId}, ${event.id}, ${consumer}) on conflict do nothing`,
      );
    }
  }

  async function dispatch(event: OutboxEvent): Promise<void> {
    const matching = consumers.filter((consumer) => consumer.types.includes(event.type));
    if (matching.length === 0) throw new Error("Olay türü için kayıtlı tüketici bulunamadı");
    for (const consumer of matching) {
      if (consumer.kind === "internal") {
        await platformScope(platformDb, async (tx) => {
          const owned = await tx.maybeOne(
            sql`select id from ${table(event)} where id = ${event.id} and status = 'leased' and lock_id = ${event.lockId} for update`,
          );
          if (owned === null || (await hasDelivery(tx, event, consumer.name))) return;
          await consumer.deliver(tx, event);
          await recordDelivery(tx, event, consumer.name);
        });
      } else {
        const skip = await platformScope(platformDb, async (tx) => {
          const owned = await tx.maybeOne(
            sql`select id from ${table(event)} where id = ${event.id} and status = 'leased' and lock_id = ${event.lockId}`,
          );
          return owned === null || (await hasDelivery(tx, event, consumer.name));
        });
        if (skip) continue;
        // Ağ çağrısı SQL işleminin ve satır kilidinin dışındadır. Çökme sonrası tekrar olağandır.
        await consumer.deliver(event);
        await platformScope(platformDb, (tx) => recordDelivery(tx, event, consumer.name));
      }
    }
    await platformScope(platformDb, (tx) =>
      tx.execute(sql`update ${table(event)}
      set status = 'delivered', delivered_at = now(), locked_until = null, lock_id = null, last_error = null
      where id = ${event.id} and status = 'leased' and lock_id = ${event.lockId}`),
    );
  }

  async function drain({
    eventIds,
    limit = 100,
  }: { eventIds?: readonly string[]; limit?: number } = {}): Promise<number> {
    let count = 0;
    while (count < limit) {
      const event = await lease(eventIds);
      if (event === null) break;
      count++;
      try {
        await dispatch(event);
      } catch (error) {
        const delay = Math.min(retryBaseMs * 2 ** Math.min(event.attempts - 1, 16), 3_600_000);
        await platformScope(platformDb, (tx) =>
          tx.execute(sql`update ${table(event)}
          set status = ${event.attempts >= maxAttempts ? "dead" : "pending"}, locked_until = null, lock_id = null,
            next_attempt_at = now() + ${delay} * interval '1 millisecond', last_error = 'Tüketici teslimi tamamlanamadı'
          where id = ${event.id} and status = 'leased' and lock_id = ${event.lockId}`),
        );
        log.warn(
          { eventId: event.id, attempts: event.attempts, err: error },
          "Olay teslimi tekrar denenecek",
        );
      }
    }
    return count;
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<unknown> = Promise.resolve();
  let stopped = true;
  function start(intervalMs = 1000): void {
    if (!stopped) return;
    stopped = false;
    const tick = () => {
      running = drain()
        .catch((error: unknown) => {
          log.error({ err: error }, "Olay dağıtıcısı duraksadı");
        })
        .finally(() => {
          if (!stopped) {
            timer = setTimeout(tick, intervalMs);
            timer.unref();
          }
        });
    };
    tick();
  }
  async function stop(): Promise<void> {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
    await running;
  }
  function purgeExpiredKeys(): Promise<number> {
    return platformScope(platformDb, (tx) =>
      tx.execute(sql`delete from idempotency_keys where id in
      (select id from idempotency_keys where expires_at <= now() order by expires_at for update skip locked limit 1000)`),
    );
  }
  return { drain, start, stop, purgeExpiredKeys };
}
