import { type Actor, SYSTEM_ACTOR_LABELS } from "@vado/contracts";

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Silinmiş ya da bulunamayan bir hesabın yerine gösterilen ad. */
const UNKNOWN_ACTOR_NAME = "Bulunamayan hesap";

/**
 * "Kim yaptı" sütunlarındaki değerleri (hesap ya da kullanıcı kimliği, sistem adı) panelde
 * gösterilecek adlara çevirir. Bütün değerler tek sorguda, birincil anahtarla okunur.
 */
export async function resolveActors(
  db: Database,
  actors: readonly (string | null)[],
): Promise<(actor: string) => Actor> {
  const ids = [...new Set(actors.filter((actor) => actor !== null && UUID.test(actor)))];
  const rows =
    ids.length === 0
      ? []
      : await db.many<{ id: string; name: string }>(sql`
          select id::text as id, display_name as name
          from admin_accounts where id = any(${ids}::uuid[])
          union all
          select id::text, coalesce(display_name, 'Adsız kullanıcı')
          from users where id = any(${ids}::uuid[])
        `);
  const names = new Map(rows.map((row) => [row.id, row.name]));
  return (actor) => ({
    id: actor,
    name: SYSTEM_ACTOR_LABELS[actor] ?? names.get(actor.toLowerCase()) ?? UNKNOWN_ACTOR_NAME,
  });
}
