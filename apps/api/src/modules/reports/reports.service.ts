import type { CreateReportBody } from "@vado/contracts";

import type { AppContext } from "../../core/context";
import { sql } from "../../core/database";

export function createReportService({ db }: AppContext) {
  /** Şikayeti kaydeder. Şikayetler yönetim panelinde incelenir. */
  async function create(userId: string, body: CreateReportBody): Promise<void> {
    await db.execute(sql`
      insert into reports (reporter_id, target_type, target_id, reason, note)
      values (${userId}, ${body.targetType}, ${body.targetId}, ${body.reason}, ${body.note ?? ""})
    `);
  }

  return { create };
}

export type ReportService = ReturnType<typeof createReportService>;
