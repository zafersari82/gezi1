import type {
  Booking,
  BookingCreate,
  BookingHours,
  BookingResource,
  BookingService,
  BookingStatusUpdate,
} from "@vado/contracts";

import type { AppContext } from "../../core/context";
import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { requireBusinessRole, type TenantScope, withTenant } from "../../core/tenant-scope";

interface ServiceRow {
  id: string;
  branch_id: string;
  name: string;
  duration_minutes: number;
  price_minor: number;
  active: boolean;
}
interface ResourceRow {
  id: string;
  branch_id: string;
  name: string;
  active: boolean;
}
interface BookingRow {
  id: string;
  business_id: string;
  branch_id: string;
  customer_user_id: string;
  service_id: string;
  resource_id: string;
  service_name: string;
  resource_name: string;
  starts_at: Date;
  ends_at: Date;
  price_minor: number;
  status: Booking["status"];
  version: number;
  created_at: Date;
  request_key: string;
}
interface SlotRow {
  starts_at: Date;
  ends_at: Date;
}
const managers = ["owner", "manager"] as const;
const toService = (row: ServiceRow): BookingService => ({
  id: row.id,
  branchId: row.branch_id,
  name: row.name,
  durationMinutes: row.duration_minutes,
  priceMinor: row.price_minor,
  active: row.active,
});
const toResource = (row: ResourceRow): BookingResource => ({
  id: row.id,
  branchId: row.branch_id,
  name: row.name,
  active: row.active,
});
const toBooking = (row: BookingRow): Booking => ({
  id: row.id,
  businessId: row.business_id,
  branchId: row.branch_id,
  customerUserId: row.customer_user_id,
  serviceId: row.service_id,
  resourceId: row.resource_id,
  serviceName: row.service_name,
  resourceName: row.resource_name,
  startsAt: row.starts_at.toISOString(),
  endsAt: row.ends_at.toISOString(),
  priceMinor: row.price_minor,
  status: row.status,
  version: row.version,
  createdAt: row.created_at.toISOString(),
});

/** Bir kaynakta aynı haftanın saat aralıkları çakışamaz. Bu vardiya planlaması değildir. */
export function validateBookingHours(hours: readonly BookingHours[]): boolean {
  for (const day of Array.from({ length: 7 }, (_, n) => n)) {
    const ordered = hours.filter((h) => h.weekday === day).sort((a, b) => a.opensAt - b.opensAt);
    if (ordered.slice(1).some((h, index) => h.opensAt < (ordered[index]?.closesAt ?? 0)))
      return false;
  }
  return true;
}

/** Yerel gün + kaynak takvimi + hizmet süresi + diğer rezervasyonlarla çakışma. */
async function availableSlots(
  tx: Database,
  businessId: string,
  branchId: string,
  serviceId: string,
  resourceId: string,
  day: string,
): Promise<SlotRow[]> {
  return tx.many<SlotRow>(sql`
    select slot.starts_at, slot.ends_at
    from booking_services s
    join booking_resources r on r.business_id=s.business_id and r.branch_id=s.branch_id
      and r.id=${resourceId} and r.active
    join branches b on b.business_id=s.business_id and b.id=s.branch_id and b.active
    join booking_resource_hours h on h.business_id=r.business_id and h.resource_id=r.id
      and h.weekday=extract(dow from ${day}::date)::int
    cross join lateral generate_series(h.opens_at::int, h.closes_at::int-s.duration_minutes, 15) AS minutes_at(minute)
    cross join lateral (
      select (${day}::date + minutes_at.minute * interval '1 minute') at time zone b.timezone as starts_at,
        (${day}::date + (minutes_at.minute+s.duration_minutes) * interval '1 minute') at time zone b.timezone as ends_at
    ) slot
    where s.business_id=${businessId} and s.branch_id=${branchId} and s.id=${serviceId} and s.active
      and ${day}::date between (now() at time zone b.timezone)::date
        and (now() at time zone b.timezone)::date + 30
      and slot.starts_at > now() + interval '30 minutes'
      and slot.ends_at > slot.starts_at
      -- DST olmayan yerel saatlere de karşı sağlam: atlanan saatleri gösterme.
      and (slot.starts_at at time zone b.timezone)::date=${day}::date
      and (extract(hour from slot.starts_at at time zone b.timezone)::int*60
        + extract(minute from slot.starts_at at time zone b.timezone)::int)=minutes_at.minute
      and not exists (
        select 1 from booking_resource_busy a where a.business_id=${businessId}
          and a.resource_id=${resourceId}
          and a.starts_at<slot.ends_at and slot.starts_at<a.ends_at
      )
    order by slot.starts_at limit 100
  `);
}

/** Kişi ile işletme bağlamı işlemde birlikte kurulur; başkasının verisi okunamaz. */
export function createBookingService({ db }: AppContext) {
  function withCustomer<T>(userId: string, businessId: string, run: (tx: Database) => Promise<T>) {
    return db.transaction(async (tx) => {
      const current = await tx.one<{ business: string | null; actor: string | null }>(sql`
        select nullif(current_setting('vado.business_id',true),'') as business,
          nullif(current_setting('vado.user_id',true),'') as actor
      `);
      if (current.business !== null || current.actor !== null) throw new AppError("forbidden");
      await tx.execute(sql`select set_config('vado.business_id',${businessId},true)`);
      await tx.execute(sql`select set_config('vado.user_id',${userId},true)`);
      const eligible = await tx.maybeOne(sql`
        select 1 from businesses b join users owner on owner.id=b.owner_id
        join users customer on customer.id=${userId}
        where b.id=${businessId} and b.status='active' and b.verified
          and owner.status='active' and customer.status='active'
      `);
      if (eligible === null) throw new AppError("business_not_found");
      return run(tx);
    });
  }
  async function services(tx: Database, businessId: string, branchId?: string, publicOnly = false) {
    const rows = await tx.many<ServiceRow>(sql`
      select id,branch_id,name,duration_minutes,price_minor,active from booking_services
      where business_id=${businessId} ${branchId === undefined ? sql.empty : sql`and branch_id=${branchId}`}
        ${publicOnly ? sql`and active` : sql.empty} order by name,id limit 200
    `);
    return rows.map(toService);
  }
  async function resources(
    tx: Database,
    businessId: string,
    branchId?: string,
    publicOnly = false,
  ) {
    const rows = await tx.many<ResourceRow>(sql`
      select id,branch_id,name,active from booking_resources
      where business_id=${businessId} ${branchId === undefined ? sql.empty : sql`and branch_id=${branchId}`}
        ${publicOnly ? sql`and active` : sql.empty} order by name,id limit 100
    `);
    return rows.map(toResource);
  }
  async function businessSetup(scope: TenantScope) {
    requireBusinessRole(scope, managers);
    return withTenant(db, scope, async (tx) => ({
      services: await services(tx, scope.businessId),
      resources: await resources(tx, scope.businessId),
      hours: (
        await tx.many<{
          resource_id: string;
          weekday: number;
          opens_at: number;
          closes_at: number;
        }>(sql`
        select resource_id,weekday,opens_at,closes_at from booking_resource_hours
        where business_id=${scope.businessId} order by resource_id,weekday,opens_at
      `)
      ).map((row) => ({
        resourceId: row.resource_id,
        weekday: row.weekday,
        opensAt: row.opens_at,
        closesAt: row.closes_at,
      })),
    }));
  }
  async function saveService(scope: TenantScope, body: Omit<BookingService, "id">, id?: string) {
    requireBusinessRole(scope, managers);
    return withTenant(db, scope, async (tx) => {
      const branch =
        await tx.maybeOne(sql`select 1 from branches where business_id=${scope.businessId}
        and id=${body.branchId} for share`);
      if (branch === null) throw new AppError("not_found");
      if (id !== undefined) {
        // Hizmet fiyatının değiştirilmesi, o hizmete ait rezervasyon onayından
        // sonra sıralanır. Kullanıcı onaylamadığı fiyatla rezervasyon oluşturmaz.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(
          ${scope.businessId} || ':service:' || ${id}, 0))`);
      }
      const row =
        id === undefined
          ? await tx.one<ServiceRow>(sql`insert into booking_services(business_id,branch_id,name,duration_minutes,price_minor,active)
            values(${scope.businessId},${body.branchId},${body.name},${body.durationMinutes},${body.priceMinor},${body.active})
            returning id,branch_id,name,duration_minutes,price_minor,active`)
          : await tx.maybeOne<ServiceRow>(sql`update booking_services set name=${body.name},duration_minutes=${body.durationMinutes},
            price_minor=${body.priceMinor},active=${body.active} where business_id=${scope.businessId} and branch_id=${body.branchId} and id=${id}
            returning id,branch_id,name,duration_minutes,price_minor,active`);
      if (row === null) throw new AppError("not_found");
      return toService(row);
    });
  }
  async function saveResource(scope: TenantScope, body: Omit<BookingResource, "id">, id?: string) {
    requireBusinessRole(scope, managers);
    return withTenant(db, scope, async (tx) => {
      const branch =
        await tx.maybeOne(sql`select 1 from branches where business_id=${scope.businessId}
        and id=${body.branchId} for share`);
      if (branch === null) throw new AppError("not_found");
      if (id !== undefined) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(
          ${scope.businessId} || ':' || ${id}, 0))`);
      }
      const row =
        id === undefined
          ? await tx.one<ResourceRow>(sql`insert into booking_resources(business_id,branch_id,name,active)
            values(${scope.businessId},${body.branchId},${body.name},${body.active})
            returning id,branch_id,name,active`)
          : await tx.maybeOne<ResourceRow>(sql`update booking_resources set name=${body.name},active=${body.active}
            where business_id=${scope.businessId} and branch_id=${body.branchId} and id=${id}
            returning id,branch_id,name,active`);
      if (row === null) throw new AppError("not_found");
      return toResource(row);
    });
  }
  async function saveHours(scope: TenantScope, resourceId: string, hours: BookingHours[]) {
    requireBusinessRole(scope, managers);
    if (!validateBookingHours(hours)) throw new AppError("validation_failed");
    return withTenant(db, scope, async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(
        ${scope.businessId} || ':' || ${resourceId}, 0))`);
      const resource =
        await tx.maybeOne(sql`select 1 from booking_resources where business_id=${scope.businessId}
        and id=${resourceId} for update`);
      if (resource === null) throw new AppError("not_found");
      await tx.execute(
        sql`delete from booking_resource_hours where business_id=${scope.businessId} and resource_id=${resourceId}`,
      );
      for (const hour of hours) {
        await tx.execute(sql`insert into booking_resource_hours(business_id,resource_id,weekday,opens_at,closes_at)
          values(${scope.businessId},${resourceId},${hour.weekday},${hour.opensAt},${hour.closesAt})`);
      }
      return { ok: true };
    });
  }
  async function publicCatalog(userId: string, businessId: string) {
    return withCustomer(userId, businessId, async (tx) => {
      const branches = await tx.many<{ id: string; name: string; timezone: string }>(sql`
        select id,name,timezone from branches where business_id=${businessId} and active order by name,id limit 100
      `);
      return {
        branches,
        services: await services(tx, businessId, undefined, true),
        resources: await resources(tx, businessId, undefined, true),
      };
    });
  }
  async function slots(
    userId: string,
    businessId: string,
    branchId: string,
    serviceId: string,
    resourceId: string,
    day: string,
  ) {
    return withCustomer(userId, businessId, async (tx) => {
      const rows = await availableSlots(tx, businessId, branchId, serviceId, resourceId, day);
      return {
        items: rows.map((row) => ({
          startsAt: row.starts_at.toISOString(),
          endsAt: row.ends_at.toISOString(),
        })),
      };
    });
  }
  async function book(userId: string, businessId: string, input: BookingCreate) {
    return withCustomer(userId, businessId, async (tx) => {
      // Aynı müşterinin aynı tekrar anahtarıyla eşzamanlı istekleri farklı kaynaklara
      // da gönderilse deterministik sıraya girer; çift rezervasyon yapamaz.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(
        ${businessId} || ':' || ${userId} || ':' || ${input.requestKey}, 0))`);
      // Müşteri kaynak/hizmet satırlarına FOR UPDATE/FOR SHARE yapamaz:
      // PostgreSQL'de bu okumalar UPDATE yetkisi ve UPDATE RLS kontrolü de gerektirir.
      // Sıralamayı danışma kilitleri korur; veriler salt SELECT ile okunur.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(
        ${businessId} || ':' || ${input.resourceId}, 0))`);
      const previous = await tx.maybeOne<BookingRow>(sql`select * from booking_reservations
        where business_id=${businessId} and customer_user_id=${userId} and request_key=${input.requestKey}`);
      if (previous !== null) {
        if (
          previous.branch_id !== input.branchId ||
          previous.service_id !== input.serviceId ||
          previous.resource_id !== input.resourceId ||
          previous.starts_at.getTime() !== new Date(input.startsAt).getTime() ||
          previous.price_minor !== input.seenPriceMinor ||
          (previous.ends_at.getTime() - previous.starts_at.getTime()) / 60000 !==
            input.seenDurationMinutes
        )
          throw new AppError("idempotency_conflict");
        return toBooking(previous);
      }
      const resource = await tx.maybeOne<ResourceRow>(sql`
        select id,branch_id,name,active from booking_resources where business_id=${businessId}
          and branch_id=${input.branchId} and id=${input.resourceId} and active
      `);
      if (resource === null) throw new AppError("not_found");
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(
        ${businessId} || ':service:' || ${input.serviceId}, 0))`);
      const slotTime = new Date(input.startsAt);
      if (!Number.isFinite(slotTime.getTime())) throw new AppError("validation_failed");
      const day = await tx.one<{ day: string }>(sql`
        select ((${input.startsAt}::timestamptz at time zone b.timezone)::date)::text as day
        from branches b where b.business_id=${businessId} and b.id=${input.branchId}
      `);
      const options = await availableSlots(
        tx,
        businessId,
        input.branchId,
        input.serviceId,
        input.resourceId,
        day.day,
      );
      const candidate = options.find((option) => option.starts_at.getTime() === slotTime.getTime());
      if (candidate === undefined) throw new AppError("record_version_conflict");
      const service = await tx.one<ServiceRow>(sql`
        select id,branch_id,name,duration_minutes,price_minor,active from booking_services
        where business_id=${businessId} and id=${input.serviceId} and branch_id=${input.branchId} and active
      `);
      if (
        service.price_minor !== input.seenPriceMinor ||
        service.duration_minutes !== input.seenDurationMinutes
      )
        throw new AppError("record_version_conflict");
      const inserted = await tx.one<BookingRow>(sql`
        insert into booking_reservations (business_id,branch_id,customer_user_id,service_id,resource_id,
          service_name,resource_name,starts_at,ends_at,price_minor,request_key)
        values(${businessId},${input.branchId},${userId},${input.serviceId},${input.resourceId},
          ${service.name},${resource.name},${candidate.starts_at},${candidate.ends_at},${service.price_minor},${input.requestKey})
        returning *
      `);
      return toBooking(inserted);
    });
  }
  async function myBookings(userId: string, businessId: string) {
    return withCustomer(userId, businessId, async (tx) => ({
      items: (
        await tx.many<BookingRow>(sql`
        select * from booking_reservations where business_id=${businessId} and customer_user_id=${userId}
        order by starts_at desc limit 100
      `)
      ).map(toBooking),
    }));
  }
  async function businessBookings(scope: TenantScope) {
    requireBusinessRole(scope, managers);
    return withTenant(db, scope, async (tx) => ({
      items: (
        await tx.many<BookingRow>(sql`
        select * from booking_reservations where business_id=${scope.businessId}
        order by starts_at desc limit 200
      `)
      ).map(toBooking),
    }));
  }
  async function setStatus(
    actor: { userId: string; businessId: string; scope?: TenantScope },
    id: string,
    body: BookingStatusUpdate,
  ) {
    const run = async (tx: Database) => {
      const booking = await tx.maybeOne<BookingRow>(sql`
        select * from booking_reservations where business_id=${actor.businessId} and id=${id} for update
      `);
      if (booking === null) throw new AppError("not_found");
      if (
        actor.scope === undefined &&
        (booking.customer_user_id !== actor.userId ||
          body.status !== "cancelled" ||
          booking.starts_at.getTime() <= Date.now())
      )
        throw new AppError("forbidden");
      if (body.status === "completed" && booking.starts_at.getTime() > Date.now())
        throw new AppError("record_version_conflict");
      if (booking.version !== body.expectedVersion || booking.status !== "confirmed")
        throw new AppError("record_version_conflict");
      const updated = await tx.one<BookingRow>(sql`
        update booking_reservations set status=${body.status},version=version+1
        where business_id=${actor.businessId} and id=${id} returning *
      `);
      return toBooking(updated);
    };
    if (actor.scope !== undefined) {
      requireBusinessRole(actor.scope, managers);
      return withTenant(db, actor.scope, run);
    }
    return withCustomer(actor.userId, actor.businessId, run);
  }
  return {
    businessSetup,
    saveService,
    saveResource,
    saveHours,
    publicCatalog,
    slots,
    book,
    myBookings,
    businessBookings,
    setStatus,
  };
}
