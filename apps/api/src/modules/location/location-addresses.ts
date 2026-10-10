import type {
  LocationAddress,
  LocationAddressBody,
  LocationAddressUpdateBody,
} from "@vado/contracts";

import { recordAudit } from "../../core/audit";
import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { appendPlatformEvent } from "../../core/outbox-events";
import { withUser } from "../../core/user-scope";
import { readLocationPath, requireLocationCatalog } from "./location-catalog";
import { locationMutation } from "./location-mutation";
interface AddressRow {
  id: string;
  user_id: string;
  country_id: string;
  province_id: string;
  district_id: string;
  neighborhood_id: string;
  label: string;
  recipient_name: string;
  phone: string;
  address_line: string;
  door: string;
  note: string;
  version: number;
  archived: boolean;
  created_at: Date;
  updated_at: Date;
}
async function toAddress(tx: Database, r: AddressRow): Promise<LocationAddress> {
  return {
    id: r.id,
    countryId: r.country_id,
    provinceId: r.province_id,
    districtId: r.district_id,
    neighborhoodId: r.neighborhood_id,
    label: r.label,
    recipientName: r.recipient_name,
    phone: r.phone,
    addressLine: r.address_line,
    door: r.door,
    note: r.note,
    version: r.version,
    archived: r.archived,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    geography: await readLocationPath(tx, r.neighborhood_id),
  };
}
async function requireAddress(tx: Database, userId: string, id: string, lock = false) {
  const row = await tx.maybeOne<AddressRow>(
    sql`select * from location_addresses where user_id=${userId} and id=${id} ${lock ? sql`for update` : sql`for share`}`,
  );
  if (row === null) throw new AppError("not_found");
  return row;
}
/** Checkout gibi platform tüketicileri kendi işlemi içinde sahipliği doğrulanmış adresi okuyabilir. */
export async function readOwnedAddress(
  tx: Database,
  userId: string,
  id: string,
): Promise<LocationAddress> {
  return withUser(tx, userId, async (scoped) =>
    toAddress(scoped, await requireAddress(scoped, userId, id)),
  );
}
export function createLocationAddresses(db: Database) {
  async function validate(tx: Database, body: LocationAddressBody) {
    await requireLocationCatalog(tx);
    const path = await readLocationPath(tx, body.neighborhoodId);
    if (
      path.country.id !== body.countryId ||
      path.province.id !== body.provinceId ||
      path.district.id !== body.districtId
    )
      throw new AppError("location_parent_invalid");
  }
  async function audit(tx: Database, userId: string, id: string, action: string, version: number) {
    await recordAudit(tx, { actor: userId, action, targetType: "location_address", targetId: id });
    await appendPlatformEvent(tx, { type: action, payload: { addressId: id, version } });
  }
  return {
    listAddresses: (userId: string) =>
      withUser(db, userId, async (tx) => ({
        items: await Promise.all(
          (
            await tx.many<AddressRow>(
              sql`select * from location_addresses where user_id=${userId} and not archived order by created_at,id`,
            )
          ).map((r) => toAddress(tx, r)),
        ),
      })),
    getAddress: (userId: string, id: string) => readOwnedAddress(db, userId, id),
    createAddress: (userId: string, key: string, body: LocationAddressBody) =>
      withUser(db, userId, (tx) =>
        locationMutation(tx, userId, null, "location.address.create", key, body, async () => {
          await validate(tx, body);
          const r = await tx.one<AddressRow>(
            sql`insert into location_addresses(user_id,country_id,province_id,district_id,neighborhood_id,label,recipient_name,phone,address_line,door,note) values(${userId},${body.countryId},${body.provinceId},${body.districtId},${body.neighborhoodId},${body.label},${body.recipientName},${body.phone},${body.addressLine},${body.door},${body.note}) returning *`,
          );
          await audit(tx, userId, r.id, "location.address_created", r.version);
          return toAddress(tx, r);
        }),
      ),
    updateAddress: (userId: string, id: string, key: string, body: LocationAddressUpdateBody) =>
      withUser(db, userId, (tx) =>
        locationMutation(tx, userId, null, `location.address.update:${id}`, key, body, async () => {
          const old = await requireAddress(tx, userId, id, true);
          if (old.version !== body.expectedVersion) throw new AppError("location_version_conflict");
          if (old.archived) throw new AppError("location_inactive");
          await validate(tx, body);
          const r = await tx.one<AddressRow>(
            sql`update location_addresses set country_id=${body.countryId},province_id=${body.provinceId},district_id=${body.districtId},neighborhood_id=${body.neighborhoodId},label=${body.label},recipient_name=${body.recipientName},phone=${body.phone},address_line=${body.addressLine},door=${body.door},note=${body.note},version=version+1 where user_id=${userId} and id=${id} returning *`,
          );
          await audit(tx, userId, id, "location.address_updated", r.version);
          return toAddress(tx, r);
        }),
      ),
    archiveAddress: (userId: string, id: string, key: string, body: { expectedVersion: number }) =>
      withUser(db, userId, (tx) =>
        locationMutation(
          tx,
          userId,
          null,
          `location.address.archive:${id}`,
          key,
          body,
          async () => {
            const old = await requireAddress(tx, userId, id, true);
            if (old.version !== body.expectedVersion)
              throw new AppError("location_version_conflict");
            if (old.archived) throw new AppError("location_inactive");
            const r = await tx.one<AddressRow>(
              sql`update location_addresses set archived=true,version=version+1 where user_id=${userId} and id=${id} returning *`,
            );
            await audit(tx, userId, id, "location.address_archived", r.version);
            return toAddress(tx, r);
          },
        ),
      ),
  };
}
