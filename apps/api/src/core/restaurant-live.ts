import { PUSH_PREVIEW_MAX } from "@vado/contracts";

import type { AppContext } from "./context";
import { sql } from "./database";
import { LIVE_EVENT_TYPES, liveView, readLive } from "./live-replay";
import type { OutboxConsumer } from "./outbox-worker";
import { platformScope } from "./platform-scope";

/** SQL'den alınan dar bildirim, kilitler bırakıldıktan sonra ilgili odalara teslim edilir. */
export function createRestaurantLiveConsumer({ platformDb, realtime }: AppContext): OutboxConsumer {
  return {
    name: "restaurant.live",
    kind: "external",
    types: LIVE_EVENT_TYPES,
    async deliver(event) {
      if (event.businessId === null) return;
      const data = await platformScope(platformDb, async (tx) => {
        const row = await readLive(tx, event.businessId ?? "", event.id);
        if (row === null) return null;
        const members = await tx.many<{ user_id: string }>(
          sql`select m.user_id from business_members m join users u on u.id=m.user_id where m.business_id=${row.business_id} and m.active and u.status='active'`,
        );
        const customer = await tx.maybeOne<{ user_id: string }>(
          sql`select c.user_id from business_customers c join users u on u.id=c.user_id where c.business_id=${row.business_id} and c.id=${row.business_customer_id} and u.status='active'`,
        );
        return { row, members, customer };
      });
      if (data === null) return;
      const payload = liveView(data.row);
      realtime.emitBusinessLive(
        payload.businessId,
        data.members.map((m) => m.user_id),
        payload,
      );
      if (payload.orderId !== null) {
        realtime.emitKitchen(payload);
        if (data.customer !== null)
          realtime.emit([data.customer.user_id], "order:changed", payload);
      }
    },
  };
}
/** İlk kararın içeriği olay anından alınır; geciken teslim sonraki durumu karar diye göstermez. */
export function createOrderPushConsumer({ platformDb, push }: AppContext): OutboxConsumer {
  return {
    name: "restaurant.customer.push",
    kind: "external",
    types: ["order.status_changed"],
    async deliver(event) {
      if (event.businessId === null || event.orderId === null) return;
      const payload = event.payload;
      const status = typeof payload.status === "string" ? payload.status : "";
      const minutes =
        typeof payload.preparationMinutes === "number" ? payload.preparationMinutes : null;
      const reason = typeof payload.rejectionReason === "string" ? payload.rejectionReason : "";
      const text =
        status === "accepted"
          ? `Siparişin kabul edildi. Tahmini hazırlık: ${minutes ?? "—"} dakika.`
          : status === "rejected"
            ? `Siparişin reddedildi: ${reason}`
            : status === "preparing"
              ? "Siparişin hazırlanıyor."
              : status === "ready"
                ? "Siparişin hazır."
                : status === "completed"
                  ? "Siparişin tamamlandı."
                  : "Siparişin iptal edildi.";
      const data = await platformScope(platformDb, async (tx) => {
        const order = await tx.maybeOne<{
          app_instance_id: string;
          mini_app_id: string;
          user_id: string;
          push_preview: boolean | null;
        }>(
          sql`select o.app_instance_id,i.mini_app_id,c.user_id,u.push_preview from orders o join app_instances i on i.business_id=o.business_id and i.id=o.app_instance_id join business_customers c on c.business_id=o.business_id and c.id=o.business_customer_id join users u on u.id=c.user_id where o.business_id=${event.businessId} and o.id=${event.orderId} and u.status='active'`,
        );
        if (order === null) return null;
        const recipients = await tx.many<{ token: string }>(
          sql`select p.token from push_tokens p join sessions s on s.id=p.session_id where s.user_id=${order.user_id} and s.revoked_at is null and s.expires_at>now()`,
        );
        return { order, recipients };
      });
      if (data === null || data.recipients.length === 0) return;
      const outcomes = await push.send(
        data.recipients.map((r) => ({
          to: r.token,
          title: "VADO · Sipariş",
          body:
            data.order.push_preview === false
              ? "Sipariş durumun güncellendi."
              : text.replace(/\s+/g, " ").slice(0, PUSH_PREVIEW_MAX),
          data: {
            type: "order",
            miniAppId: data.order.mini_app_id,
            businessId: event.businessId ?? "",
            appInstanceId: data.order.app_instance_id,
            orderId: event.orderId ?? "",
            eventId: event.id,
          },
        })),
      );
      const invalid = data.recipients
        .filter((_, i) => outcomes[i] === "invalid")
        .map((r) => r.token);
      if (invalid.length > 0)
        await platformScope(platformDb, (tx) =>
          tx.execute(sql`delete from push_tokens where token=any(${invalid}::text[])`),
        );
      if (outcomes.length !== data.recipients.length || outcomes.includes("failed"))
        throw new Error("Sipariş bildirimi teslim edilemedi");
    },
  };
}
