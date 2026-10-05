import { type Database, sql } from "./database";

/** Yönetim paneli üzerinden yapılan işlemlerin denetim kaydındaki adı. */
export const ADMIN_ACTOR = "admin";

export interface AuditEvent {
  /** `ADMIN_ACTOR` veya işlemi yapan kullanıcının kimliği. */
  actor: string;
  /** `alan.eylem` biçiminde: `miniapp.updated`, `payment.confirmed` gibi. */
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
}

/** Denetim kaydına satır ekler. İşlem içinde çağrılırsa asıl değişiklikle birlikte kaydedilir. */
export async function recordAudit(db: Database, event: AuditEvent): Promise<void> {
  await db.execute(sql`
    insert into audit_log (actor, action, target_type, target_id, metadata)
    values (
      ${event.actor},
      ${event.action},
      ${event.targetType},
      ${event.targetId},
      ${JSON.stringify(event.metadata ?? {})}::jsonb
    )
  `);
}
