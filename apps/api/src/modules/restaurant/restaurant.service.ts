import {
  type RestaurantTableBody,
  type TableSession,
  type UpdateRestaurantTableBody,
} from "@vado/contracts";

import { authorize, permittedBranch } from "../../core/business-access";
import type { AppContext } from "../../core/context";
import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { withIdempotency } from "../../core/idempotency";
import { requireBusinessRole, type TenantScope, withTenant } from "../../core/tenant-scope";
import { createStorefrontContext } from "../business-management/storefront-context";
import type { QrService } from "../qr/qr.service";

interface SessionRow {
  id: string;
  table_id: string;
  branch_id: string;
  app_instance_id: string;
  label: string;
  status: TableSession["status"];
  version: number;
}
function sessionView(row: SessionRow): TableSession {
  return {
    id: row.id,
    tableId: row.table_id,
    branchId: row.branch_id,
    appInstanceId: row.app_instance_id,
    label: row.label,
    status: row.status,
    version: row.version,
  };
}
function customer(scope: TenantScope) {
  if (
    scope.role !== "customer" ||
    scope.appInstanceId === null ||
    scope.businessCustomerId === null
  )
    throw new AppError("forbidden");
  return { instance: scope.appInstanceId, customer: scope.businessCustomerId };
}
async function ownSession(tx: Database, scope: TenantScope, id: string, open = false) {
  const actor = customer(scope);
  const row =
    await tx.maybeOne<SessionRow>(sql`select s.*,t.label from table_sessions s join restaurant_tables t on t.business_id=s.business_id and t.id=s.table_id
    join table_session_members m on m.business_id=s.business_id and m.table_session_id=s.id
    where s.business_id=${scope.businessId} and s.id=${id} and s.app_instance_id=${actor.instance} and m.business_customer_id=${actor.customer} for share of s`);
  if (row === null) throw new AppError("not_found");
  if (open && row.status !== "open") throw new AppError("table_session_closed");
  return row;
}
export function createRestaurantService(
  { db, storage }: Pick<AppContext, "db" | "storage">,
  qr: Pick<QrService, "issueTable" | "tablePayload">,
) {
  const context = createStorefrontContext({ db, storage });
  function slots(scope: TenantScope, branchId: string) {
    customer(scope);
    return withTenant(db, scope, async (tx) => {
      const branch = await tx.maybeOne<{
        preparation_minutes: number;
        open_now: boolean;
      }>(sql`select coalesce(s.preparation_minutes,20) as preparation_minutes,branch_is_open(b.business_id,b.id,now()) as open_now
      from branches b left join branch_ordering_settings s on s.business_id=b.business_id and s.branch_id=b.id where b.business_id=${scope.businessId} and b.id=${branchId} and b.active for share of b`);
      if (branch === null) throw new AppError("not_found");
      const rows = await tx.many<{ at: Date }>(sql`select distinct candidate.at from branches b
      left join branch_ordering_settings s on s.business_id=b.business_id and s.branch_id=b.id
      cross join generate_series(0,coalesce(s.advance_days,7)) day_index
      cross join lateral generate_series(0,1439,coalesce(s.slot_minutes,15)) minute_index
      cross join lateral (select (((now() at time zone b.timezone)::date+day_index)::timestamp+make_interval(mins=>minute_index)) at time zone b.timezone as at) candidate
      where b.business_id=${scope.businessId} and b.id=${branchId} and restaurant_fulfilment_allowed(${scope.businessId},${scope.appInstanceId},${branchId},'pickup',candidate.at,null,${scope.businessCustomerId}) order by candidate.at limit 500`);
      return {
        items: rows.map((row) => ({ at: row.at.toISOString() })),
        preparationMinutes: branch.preparation_minutes,
        openNow: branch.open_now,
      };
    });
  }
  function tables(scope: TenantScope) {
    requireBusinessRole(scope, ["owner", "manager", "staff"]);
    return withTenant(db, scope, async (tx) => ({
      items: await tx.many(sql`
    select t.id,t.branch_id as "branchId",t.app_instance_id as "appInstanceId",t.label,t.active,t.version,s.id as "sessionId" from restaurant_tables t left join table_sessions s on s.business_id=t.business_id and s.table_id=t.id and s.status='open' where t.business_id=${scope.businessId} ${permittedBranch(scope, "tables.serve", sql`t.branch_id`)} order by t.label,t.id`),
    }));
  }
  function createTable(scope: TenantScope, body: RestaurantTableBody) {
    requireBusinessRole(scope, ["owner", "manager"]);
    return withTenant(db, scope, async (tx) => {
      const cap = await tx.one<{ allowed: boolean }>(
        sql`select ordering_capabilities_for_instance(${scope.businessId},${body.appInstanceId}) ? 'ordering.table_service@1.0.0' as allowed`,
      );
      if (!cap.allowed) throw new AppError("forbidden");
      if (
        (await tx.maybeOne(
          sql`select 1 from branches where business_id=${scope.businessId} and id=${body.branchId} and active for share`,
        )) === null
      )
        throw new AppError("not_found");
      return tx.one(
        sql`insert into restaurant_tables(business_id,branch_id,app_instance_id,label,active) values(${scope.businessId},${body.branchId},${body.appInstanceId},${body.label},${body.active}) returning id,branch_id as "branchId",app_instance_id as "appInstanceId",label,active,version,null::uuid as "sessionId"`,
      );
    });
  }
  function updateTable(scope: TenantScope, id: string, body: UpdateRestaurantTableBody) {
    requireBusinessRole(scope, ["owner", "manager"]);
    return withTenant(db, scope, async (tx) => {
      const table = await tx.maybeOne<{ version: number }>(
        sql`select version from restaurant_tables where business_id=${scope.businessId} and id=${id} for update`,
      );
      if (table === null) throw new AppError("not_found");
      if (table.version !== body.expectedVersion) throw new AppError("settings_version_conflict");
      if (
        !body.active &&
        (await tx.maybeOne(
          sql`select 1 from table_sessions where business_id=${scope.businessId} and table_id=${id} and status='open'`,
        )) !== null
      )
        throw new AppError("table_in_use");
      return tx.one(
        sql`update restaurant_tables set label=${body.label},active=${body.active} where business_id=${scope.businessId} and id=${id} returning id,branch_id as "branchId",app_instance_id as "appInstanceId",label,active,version,(select s.id from table_sessions s where s.business_id=${scope.businessId} and s.table_id=${id} and s.status='open') as "sessionId"`,
      );
    });
  }
  function tableQr(scope: TenantScope, id: string) {
    requireBusinessRole(scope, ["owner", "manager"]);
    return withTenant(db, scope, async (tx) => {
      const table = await tx.maybeOne<{
        branch_id: string;
        app_instance_id: string;
        mini_app_id: string;
      }>(
        sql`select t.*,i.mini_app_id from restaurant_tables t join app_instances i on i.business_id=t.business_id and i.id=t.app_instance_id where t.business_id=${scope.businessId} and t.id=${id} and t.active and i.active`,
      );
      if (table === null) throw new AppError("not_found");
      return qr.issueTable(table.mini_app_id, {
        business: scope.businessId,
        instance: table.app_instance_id,
        masa: id,
        sube: table.branch_id,
      });
    });
  }
  function join(scope: TenantScope, value: string) {
    const actor = customer(scope);
    const payload = qr.tablePayload(value);
    return withTenant(db, scope, async (tx) => {
      const tableKey = payload.params.masa;
      const branchKey = payload.params.sube;
      if (
        tableKey === undefined ||
        branchKey === undefined ||
        (payload.params.business !== undefined && payload.params.business !== scope.businessId) ||
        (payload.params.instance !== undefined && payload.params.instance !== actor.instance)
      )
        throw new AppError("qr_invalid");
      const table = await tx.maybeOne<{
        id: string;
        branch_id: string;
        app_instance_id: string;
        label: string;
      }>(sql`
      select t.* from restaurant_tables t join branches b on b.business_id=t.business_id and b.id=t.branch_id join app_instances i on i.business_id=t.business_id and i.id=t.app_instance_id
      where t.business_id=${scope.businessId} and t.app_instance_id=${actor.instance} and i.mini_app_id=${payload.miniAppId} and i.active and t.active and b.active
        and (t.id::text=${tableKey} or t.label=${tableKey}) and (b.id::text=${branchKey} or b.name=${branchKey}) for update of t`);
      if (table === null) throw new AppError("qr_invalid");
      const cap = await tx.one<{ allowed: boolean }>(
        sql`select ordering_capabilities_for_instance(${scope.businessId},${actor.instance}) ? 'ordering.table_service@1.0.0' as allowed`,
      );
      if (!cap.allowed) throw new AppError("forbidden");
      let session = await tx.maybeOne<SessionRow>(
        sql`select s.*,${table.label}::text as label from table_sessions s where s.business_id=${scope.businessId} and s.table_id=${table.id} and s.status='open' for update`,
      );
      session ??= await tx.one<SessionRow>(
        sql`insert into table_sessions(business_id,table_id,branch_id,app_instance_id) values(${scope.businessId},${table.id},${table.branch_id},${table.app_instance_id}) returning *,${table.label}::text as label`,
      );
      await tx.execute(
        sql`insert into table_session_members(business_id,table_session_id,business_customer_id) values(${scope.businessId},${session.id},${actor.customer}) on conflict do nothing`,
      );
      return sessionView(session);
    });
  }
  function getSession(scope: TenantScope, id: string) {
    return withTenant(db, scope, async (tx) => sessionView(await ownSession(tx, scope, id)));
  }
  function request(scope: TenantScope, id: string, kind: "waiter" | "bill", key: string) {
    const actor = customer(scope);
    return withTenant(db, scope, (tx) =>
      withIdempotency(
        tx,
        scope,
        "restaurant.table_request",
        key,
        { sessionId: id, kind },
        async () => {
          const seating = await ownSession(tx, scope, id, true);
          let row =
            await tx.maybeOne(sql`insert into table_service_requests(business_id,table_session_id,business_customer_id,kind) values(${scope.businessId},${id},${actor.customer},${kind})
      on conflict(business_id,table_session_id,business_customer_id,kind) where status='open' do nothing returning id`);
          row ??= await tx.one(
            sql`select id from table_service_requests where business_id=${scope.businessId} and table_session_id=${id} and business_customer_id=${actor.customer} and kind=${kind} and status='open'`,
          );
          return { status: 200, body: { ...row, tableSessionId: id, kind, label: seating.label } };
        },
      ),
    );
  }
  function bill(scope: TenantScope, id: string) {
    return withTenant(db, scope, async (tx) => {
      const isCustomer = scope.role === "customer";
      if (isCustomer) await ownSession(tx, scope, id);
      else requireBusinessRole(scope, ["owner", "manager", "staff"]);
      const session = await tx.maybeOne<SessionRow>(
        sql`select s.*,t.label from table_sessions s join restaurant_tables t on t.business_id=s.business_id and t.id=s.table_id where s.business_id=${scope.businessId} and s.id=${id} for share of s`,
      );
      if (session === null) throw new AppError("not_found");
      if (!isCustomer) await authorize(tx, scope, "tables.serve", session.branch_id);
      const row = await tx.one<{
        total: number;
        paid: number;
      }>(sql`select coalesce(sum(o.total_minor),0)::bigint as total,coalesce(sum(case when p.id is null then 0 else p.amount_minor end),0)::bigint as paid
      from orders o left join order_payments p on p.business_id=o.business_id and p.order_id=o.id where o.business_id=${scope.businessId} and o.table_session_id=${id}
        and o.status not in ('rejected','cancelled') ${isCustomer ? sql`and o.business_customer_id=${scope.businessCustomerId} and o.app_instance_id=${scope.appInstanceId}` : sql.empty}`);
      if (isCustomer)
        return {
          ownTotalMinor: row.total,
          ownPaidMinor: row.paid,
          ownDueMinor: row.total - row.paid,
        };
      return {
        id: session.id,
        version: session.version,
        status: session.status,
        label: session.label,
        totalMinor: row.total,
        paidMinor: row.paid,
        dueMinor: row.total - row.paid,
        orders: await tx.many(
          sql`select o.id,o.status,o.version,o.total_minor as "totalMinor",(o.total_minor=0 or exists(select 1 from order_payments p where p.business_id=o.business_id and p.order_id=o.id)) as paid from orders o where o.business_id=${scope.businessId} and o.table_session_id=${id} order by o.created_at,o.id`,
        ),
      };
    });
  }
  function requests(scope: TenantScope) {
    requireBusinessRole(scope, ["owner", "manager", "staff"]);
    return withTenant(db, scope, async (tx) => ({
      items:
        await tx.many(sql`select r.id,r.table_session_id as "tableSessionId",r.kind,r.status,r.version,r.created_at as "createdAt",t.label,s.branch_id as "branchId"
    from table_service_requests r join table_sessions s on s.business_id=r.business_id and s.id=r.table_session_id join restaurant_tables t on t.business_id=s.business_id and t.id=s.table_id where r.business_id=${scope.businessId} and r.status='open' ${permittedBranch(scope, "tables.serve", sql`s.branch_id`)} order by r.created_at,r.id`),
    }));
  }
  function resolveRequest(scope: TenantScope, id: string, expectedVersion: number) {
    requireBusinessRole(scope, ["owner", "manager", "staff"]);
    return withTenant(db, scope, async (tx) => {
      const target = await tx.maybeOne<{ branch_id: string }>(
        sql`select s.branch_id from table_service_requests r join table_sessions s on s.business_id=r.business_id and s.id=r.table_session_id where r.business_id=${scope.businessId} and r.id=${id}`,
      );
      if (target === null) throw new AppError("not_found");
      await authorize(tx, scope, "tables.serve", target.branch_id);
      const row = await tx.maybeOne(
        sql`update table_service_requests set status='resolved',version=version+1 where business_id=${scope.businessId} and id=${id} and version=${expectedVersion} and status='open' returning id,version`,
      );
      if (row === null) throw new AppError("settings_version_conflict");
      return row;
    });
  }
  function closeSession(scope: TenantScope, id: string, expectedVersion: number) {
    requireBusinessRole(scope, ["owner", "manager", "staff"]);
    return withTenant(db, scope, async (tx) => {
      const target = await tx.maybeOne<{ table_id: string; branch_id: string }>(
        sql`select table_id,branch_id from table_sessions where business_id=${scope.businessId} and id=${id}`,
      );
      if (target === null) throw new AppError("not_found");
      await authorize(tx, scope, "tables.serve", target.branch_id);
      await tx.one(
        sql`select id from restaurant_tables where business_id=${scope.businessId} and id=${target.table_id} for update`,
      );
      const session = await tx.one<{ version: number; status: string }>(
        sql`select version,status from table_sessions where business_id=${scope.businessId} and id=${id} for update`,
      );
      if (session.version !== expectedVersion || session.status !== "open")
        throw new AppError("settings_version_conflict");
      const busy = await tx.maybeOne(
        sql`select id from orders o where o.business_id=${scope.businessId} and o.table_session_id=${id} and (o.status not in ('rejected','completed','cancelled') or (o.status='completed' and o.total_minor>0 and not exists(select 1 from order_payments p where p.business_id=o.business_id and p.order_id=o.id))) limit 1`,
      );
      if (busy !== null) throw new AppError("table_in_use");
      const row = await tx.maybeOne(
        sql`update table_sessions set status='closed',version=version+1,closed_at=now() where business_id=${scope.businessId} and id=${id} and version=${expectedVersion} and status='open' returning id,status,version`,
      );
      if (row === null) throw new AppError("settings_version_conflict");
      await tx.execute(
        sql`update table_service_requests set status='resolved',version=version+1 where business_id=${scope.businessId} and table_session_id=${id} and status='open'`,
      );
      return row;
    });
  }
  return {
    context,
    slots,
    tables,
    createTable,
    updateTable,
    tableQr,
    join,
    getSession,
    request,
    bill,
    requests,
    resolveRequest,
    closeSession,
  };
}
