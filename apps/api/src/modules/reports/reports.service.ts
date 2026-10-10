import type { CreateReportBody } from "@vado/contracts";

import type { AppContext } from "../../core/context";
import { sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { platformScope } from "../../core/platform-scope";

export function createReportService({ db, platformDb }: AppContext) {
  /** Şikayeti kaydeder. Şikayetler yönetim panelinde incelenir. */
  async function create(userId: string, body: CreateReportBody): Promise<void> {
    if (body.targetType === "review") {
      if (!/^[0-9a-f-]{36}$/i.test(body.targetId)) throw new AppError("validation_failed");
      const visible = await platformScope(platformDb, (tx) =>
        tx.maybeOne(
          sql`select r.id from reviews r join businesses b on b.id=r.business_id join users u on u.id=b.owner_id where r.id=${body.targetId}::uuid and r.visibility='published' and b.status='active' and b.verified and u.status='active'`,
        ),
      );
      if (visible === null) throw new AppError("not_found");
    }
    await db.execute(sql`
      insert into reports (reporter_id, target_type, target_id, reason, note)
      values (${userId}, ${body.targetType}, ${body.targetId}, ${body.reason}, ${body.note ?? ""})
    `);
  }

  return { create };
}

export type ReportService = ReturnType<typeof createReportService>;
