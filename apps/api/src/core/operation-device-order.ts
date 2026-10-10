import { sql, type SqlFragment } from "./database";

/** Cihazın görebileceği siparişlerin yetkisi, sipariş anındaki paket görüntüsünden gelir. */
export function supportsOperationDevice(capabilities: SqlFragment): SqlFragment {
  return sql`exists (
    select 1 from capability_catalog c
    where c.engine='ordering' and cardinality(c.device_statuses)>0
      and ${capabilities} ? (c.id || '@' || c.version)
  )`;
}
