import { type Database, sql } from "./database";

/**
 * 2.3.1 ve öncesinde panelin tek, paylaşılan hesabıyla yapılan işlemlerin denetim kaydındaki adı.
 * 2.4'ten sonra panel işlemlerine hesabın kimliği yazılır; bu değer yalnızca eski kayıtlarda görünür.
 */
export const LEGACY_ADMIN_ACTOR = "admin";

/** Komut satırından (`npm run admins`) yapılan işlemlerin denetim kaydındaki adı. */
export const CLI_ACTOR = "cli";

/** Var olmayan bir hesap adıyla yapılan giriş denemesinin denetim kaydındaki adı. */
export const ANONYMOUS_ACTOR = "anonymous";

export interface AuditEvent {
  /** İşlemi yapan yönetici hesabının ya da kullanıcının kimliği; ya da yukarıdaki sabitlerden biri. */
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
