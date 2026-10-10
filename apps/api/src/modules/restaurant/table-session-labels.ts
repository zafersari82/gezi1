import { sql } from "../../core/database";
import type { ContextLabeler } from "../ordering/ordering.service";

/** Masa oturumu bağlamının adı, oturumun masasının adıdır ("Masa 4"). */
export const tableSessionLabels: ContextLabeler = async (tx, scope, ids) => {
  const rows = await tx.many<{ id: string; label: string }>(sql`
    select s.id, t.label
    from table_sessions s
    join restaurant_tables t on t.business_id = s.business_id and t.id = s.table_id
    where s.business_id = ${scope.businessId} and s.id = any(${ids}::uuid[])
  `);
  return new Map(rows.map((row) => [row.id, row.label]));
};
