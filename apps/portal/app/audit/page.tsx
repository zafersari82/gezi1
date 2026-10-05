import { auditEntrySchema, pageOf, pageQuerySchema } from "@vado/contracts";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { adminGet } from "@/lib/api";
import { AUDIT_ACTION_LABELS, AUDIT_TARGET_LABELS, formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Denetim kaydı" };

const ADMIN_ACTOR = "admin";

export default async function AuditPage({ searchParams }: PageProps<"/audit">) {
  const { cursor } = pageQuerySchema.pick({ cursor: true }).parse(await searchParams);
  const page = await adminGet(
    pageOf(auditEntrySchema),
    `/v1/admin/audit${cursor === undefined ? "" : `?cursor=${cursor}`}`,
  );

  return (
    <>
      <PageHeader
        title="Denetim kaydı"
        lead="Panelden yapılan işlemler ile hesap silme, işletme başvurusu ve ödeme gibi önemli kullanıcı işlemleri burada kalıcı olarak tutulur."
      />

      <div className="panel table-scroll">
        {page.items.length === 0 ? (
          <p className="empty">Henüz kayıt yok.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Zaman</th>
                <th scope="col">İşlem</th>
                <th scope="col">Kayıt</th>
                <th scope="col">Yapan</th>
                <th scope="col">Ayrıntı</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatDateTime(entry.createdAt)}</td>
                  <td>{AUDIT_ACTION_LABELS[entry.action] ?? entry.action}</td>
                  <td>
                    {AUDIT_TARGET_LABELS[entry.targetType] ?? entry.targetType}
                    <span className="cell-sub mono">{entry.targetId}</span>
                  </td>
                  <td>
                    {entry.actor === ADMIN_ACTOR ? (
                      "Panel"
                    ) : (
                      <>
                        Kullanıcı
                        <span className="cell-sub mono">{entry.actor}</span>
                      </>
                    )}
                  </td>
                  <td className="mono">
                    {Object.keys(entry.metadata).length === 0 ? "" : JSON.stringify(entry.metadata)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {page.nextCursor !== null && (
          <p className="pager">
            <Link href={`/audit?cursor=${page.nextCursor}`}>Daha eski kayıtlar</Link>
          </p>
        )}
      </div>
    </>
  );
}
