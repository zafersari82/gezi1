import { createHmac, randomInt } from "node:crypto";

import {
  type ApproveOperationDeviceBody,
  BUSINESS_SOCKET_TTL_MS,
  type BusinessSocketTicket,
  type OperationDevice,
} from "@vado/contracts";

import type { AppContext } from "../../core/context";
import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { platformScope } from "../../core/platform-scope";
import { randomToken, safeEqual, sha256 } from "../../core/security";
import {
  authoriseDeviceTenant,
  type DeviceTenantScope,
  requireBusinessRole,
  type TenantScope,
  withTenant,
} from "../../core/tenant-scope";
import type { DeviceSocketAuth } from "../../realtime/realtime";

interface DeviceRow {
  id: string;
  business_id: string;
  branch_id: string;
  app_instance_id: string;
  label: string;
  expires_at: Date;
  revoked_at: Date | null;
}
const view = (r: DeviceRow): OperationDevice => ({
  id: r.id,
  businessId: r.business_id,
  branchId: r.branch_id,
  appInstanceId: r.app_instance_id,
  label: r.label,
  expiresAt: r.expires_at.toISOString(),
  revokedAt: r.revoked_at?.toISOString() ?? null,
});

export function createOperationDeviceService({ db, platformDb, config, realtime }: AppContext) {
  // Geçici teslim sırrı, mevcut gizli anahtarla ayrı bir alanda türetilir; SQL'e açık belirteç yazılmaz.
  // Şema adları değişse de mevcut eşleştirme kodları geçerli kalmalıdır.
  // HMAC alan ayırıcı önceki sürümle birebir aynıdır; burada yeniden adlandırılmaz.
  const credential = (id: string, pollHash: string) =>
    createHmac("sha256", config.keys.openId)
      .update(`vado-kitchen-device\0${id}\0${pollHash}`)
      .digest("base64url");
  function begin() {
    return platformScope(platformDb, async (tx) => {
      for (let i = 0; i < 5; i++) {
        const code = String(randomInt(0, 100_000_000)).padStart(8, "0");
        const secret = randomToken();
        const row = await tx.maybeOne<{ id: string; expires_at: Date }>(
          sql`insert into operation_device_pairings(code_hash,poll_hash) values(${sha256(code)},${sha256(secret)}) on conflict(code_hash) do nothing returning id,expires_at`,
        );
        if (row !== null)
          return { id: row.id, code, secret, expiresAt: row.expires_at.toISOString() };
      }
      throw new AppError("order_state_invalid");
    });
  }
  function approve(scope: TenantScope, body: ApproveOperationDeviceBody) {
    requireBusinessRole(scope, ["owner", "manager"]);
    return withTenant(db, scope, async (tx) => {
      const branch = await tx.maybeOne(
        sql`select id from branches where business_id=${scope.businessId} and id=${body.branchId} and active for share`,
      );
      const instance = await tx.maybeOne(
        sql`select id from app_instances where business_id=${scope.businessId} and id=${body.appInstanceId} and active for share`,
      );
      if (branch === null || instance === null) throw new AppError("not_found");
      const cap = await tx.maybeOne(
        sql`select a.id from app_instances a where a.business_id=${scope.businessId}
          and a.id=${body.appInstanceId} and exists (
            select 1 from capability_catalog c where c.engine='ordering'
              and cardinality(c.device_statuses)>0
              and ordering_capabilities_for_instance(a.business_id,a.id) ? (c.id || '@' || c.version)
          ) for share of a`,
      );
      if (cap === null) throw new AppError("forbidden");
      const pairing = await tx.maybeOne<{ id: string; poll_hash: string }>(
        sql`select * from lookup_device_pairing(${sha256(body.code)},${scope.businessId},${scope.userId})`,
      );
      if (pairing === null) throw new AppError("order_state_invalid");
      const actor = await tx.one<{ id: string }>(
        sql`select id from business_members where business_id=${scope.businessId} and user_id=${scope.userId} and active`,
      );
      const row = await tx.one<DeviceRow>(
        sql`insert into operation_devices(business_id,branch_id,app_instance_id,label,token_hash,approved_by) values(${scope.businessId},${body.branchId},${body.appInstanceId},${body.label},${sha256(credential(pairing.id, pairing.poll_hash))},${actor.id}) returning *`,
      );
      await tx.execute(
        sql`select approve_device_pairing(${pairing.id},${scope.businessId},${row.id},${scope.userId})`,
      );
      return view(row);
    });
  }
  async function poll(id: string, secret: string) {
    const result = await platformScope(platformDb, async (tx) => {
      const row = await tx.maybeOne<{
        id: string;
        poll_hash: string;
        business_id: string | null;
        device_id: string | null;
        expires_at: Date;
        status: string;
        attempts: number;
      }>(
        sql`select * from operation_device_pairings where id=${id} and expires_at>now() and attempts<5 for update`,
      );
      if (row === null) return null;
      if (!safeEqual(row.poll_hash, sha256(secret))) {
        await tx.execute(sql`update operation_device_pairings set attempts=attempts+1 where id=${id}`);
        return null;
      }
      if (row.status === "pending")
        return { status: "pending" as const, expiresAt: row.expires_at.toISOString() };
      const device = await active(
        tx,
        sql`d.id=${row.device_id} and d.business_id=${row.business_id}`,
      );
      if (device === null) return null;
      return {
        status: "approved" as const,
        token: credential(row.id, row.poll_hash),
        device: view(device),
      };
    });
    // Yanlış denemenin artırımı önce kapanır; hata işlemi geri alıp sayacı sıfırlamaz.
    if (result === null) throw new AppError("unauthorized");
    return result;
  }
  async function active(tx: Database, filter: ReturnType<typeof sql>) {
    return tx.maybeOne<DeviceRow>(sql`select d.* from operation_devices d
      join branches b on b.business_id=d.business_id and b.id=d.branch_id
      join app_instances i on i.business_id=d.business_id and i.id=d.app_instance_id
      join businesses business on business.id=d.business_id join users u on u.id=business.owner_id
      where ${filter} and d.revoked_at is null and d.expires_at>now() and b.active and i.active and u.status='active' and business.status='active' and business.verified
        and exists (select 1 from capability_catalog c where c.engine='ordering'
          and cardinality(c.device_statuses)>0
          and ordering_capabilities_for_instance(d.business_id,d.app_instance_id) ? (c.id || '@' || c.version)) for share of d,b,i,u`);
  }
  async function authenticate(token: string): Promise<DeviceTenantScope> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AppError("unauthorized");
    const row = await platformScope(platformDb, (tx) =>
      active(tx, sql`d.token_hash=${sha256(token)}`),
    );
    if (row === null) throw new AppError("unauthorized");
    return authoriseDeviceTenant({
      businessId: row.business_id,
      branchId: row.branch_id,
      appInstanceId: row.app_instance_id,
      deviceId: row.id,
      role: "device",
      userId: null,
      businessCustomerId: null,
    });
  }
  function info(scope: DeviceTenantScope) {
    return withTenant(db, scope, async (tx) => {
      const row = await tx.one<DeviceRow & { business_name: string; branch_name: string }>(
        sql`select d.*,b.name as business_name,branch.name as branch_name from operation_devices d join businesses b on b.id=d.business_id join branches branch on branch.business_id=d.business_id and branch.id=d.branch_id where d.business_id=${scope.businessId} and d.id=${scope.deviceId}`,
      );
      return { ...view(row), businessName: row.business_name, branchName: row.branch_name };
    });
  }
  function list(scope: TenantScope) {
    requireBusinessRole(scope, ["owner", "manager"]);
    return withTenant(db, scope, async (tx) => ({
      items: (
        await tx.many<DeviceRow>(
          sql`select * from operation_devices where business_id=${scope.businessId} order by created_at desc limit 500`,
        )
      ).map(view),
    }));
  }
  async function revoke(scope: TenantScope, id: string) {
    requireBusinessRole(scope, ["owner", "manager"]);
    const result = await withTenant(db, scope, async (tx) => {
      const row = await tx.maybeOne<DeviceRow>(
        sql`select * from operation_devices where business_id=${scope.businessId} and id=${id} for update`,
      );
      if (row === null) throw new AppError("not_found");
      if (row.revoked_at === null)
        return view(
          await tx.one<DeviceRow>(
            sql`update operation_devices set revoked_at=now() where business_id=${scope.businessId} and id=${id} returning *`,
          ),
        );
      return view(row);
    });
    realtime.disconnectOperationDevice(id);
    return result;
  }
  function issueTicket(scope: DeviceTenantScope): Promise<BusinessSocketTicket> {
    return withTenant(db, scope, async (tx) => {
      const ticket = randomToken();
      const row = await tx.one<{ expires_at: Date }>(
        sql`insert into operation_device_tickets(business_id,device_id,token_hash) values(${scope.businessId},${scope.deviceId},${sha256(ticket)}) returning expires_at`,
      );
      return { ticket, expiresAt: row.expires_at.toISOString(), socketUrl: config.publicUrl };
    });
  }
  async function consumeTicket(ticket: string): Promise<DeviceSocketAuth> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(ticket)) throw new AppError("unauthorized");
    return platformScope(platformDb, async (tx) => {
      // Tek kullanım hakkı tek bir koşullu UPDATE ile alınır. Eşzamanlı isteklerden
      // yalnız biri biletin tüketimini tamamlayabilir; cihaz geçersizse işlem geri alınır.
      const claimed = await tx.maybeOne<{ business_id: string; device_id: string }>(
        sql`update operation_device_tickets set used_at=clock_timestamp()
          where token_hash=${sha256(ticket)} and used_at is null
            and expires_at>clock_timestamp()
          returning business_id,device_id`,
      );
      if (claimed === null) throw new AppError("unauthorized");
      const device = await active(
        tx,
        sql`d.id=${claimed.device_id} and d.business_id=${claimed.business_id}`,
      );
      if (device === null) throw new AppError("unauthorized");
      return {
        kind: "device",
        businessId: device.business_id,
        branchId: device.branch_id,
        appInstanceId: device.app_instance_id,
        deviceId: device.id,
        liveUntil: Math.min(Date.now() + BUSINESS_SOCKET_TTL_MS, device.expires_at.getTime()),
      };
    });
  }
  async function isActive(deviceId: string) {
    return (await platformScope(platformDb, (tx) => active(tx, sql`d.id=${deviceId}`))) !== null;
  }
  return {
    begin,
    approve,
    poll,
    authenticate,
    info,
    list,
    revoke,
    issueTicket,
    consumeTicket,
    isActive,
  };
}
