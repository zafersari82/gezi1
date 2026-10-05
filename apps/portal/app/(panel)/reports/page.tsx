import { adminReportSchema, listOf, REPORT_REASON_LABELS } from "@vado/contracts";
import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { Tag } from "@/components/tag";
import { setReportStatus } from "@/lib/actions";
import { adminGet } from "@/lib/api";
import { formatDateTime, REPORT_TARGET_LABELS } from "@/lib/format";

export const metadata: Metadata = { title: "Şikayetler" };

export default async function ReportsPage() {
  const { items: reports } = await adminGet(listOf(adminReportSchema), "/v1/admin/reports");

  return (
    <>
      <PageHeader
        title="Şikayetler"
        lead="Kullanıcıların bildirdiği hesap, içerik, işletme ve mini uygulamalar. Gereken işlemi ilgili bölümde yaptıktan sonra şikayeti çözüldü olarak işaretle."
      />

      <div className="panel table-scroll">
        {reports.length === 0 ? (
          <p className="empty">Henüz şikayet yok.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Şikayet</th>
                <th scope="col">Bildirilen kayıt</th>
                <th scope="col">Bildiren</th>
                <th scope="col">Tarih</th>
                <th scope="col">Durum</th>
                <th scope="col">
                  <span className="visually-hidden">İşlem</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id}>
                  <td>
                    <span className="cell-title">{REPORT_REASON_LABELS[report.reason]}</span>
                    {report.note !== "" && <span className="cell-sub">{report.note}</span>}
                  </td>
                  <td>
                    {REPORT_TARGET_LABELS[report.targetType]}
                    <span className="cell-sub mono">
                      {/* Panelde kendi sayfası olan tek kayıt türü mini uygulamadır. */}
                      {report.targetType === "miniapp" ? (
                        <Link href={`/miniapps/${report.targetId}`}>{report.targetId}</Link>
                      ) : (
                        report.targetId
                      )}
                    </span>
                  </td>
                  <td>{report.reporter.displayName}</td>
                  <td>{formatDateTime(report.createdAt)}</td>
                  <td>
                    {report.status === "open" ? (
                      <Tag label="Açık" tone="warning" />
                    ) : (
                      <Tag label="Çözüldü" tone="neutral" />
                    )}
                  </td>
                  <td className="actions">
                    {report.status === "open" ? (
                      <form action={setReportStatus.bind(null, report.id, "resolved")}>
                        <SubmitButton variant="primary">Çözüldü</SubmitButton>
                      </form>
                    ) : (
                      <form action={setReportStatus.bind(null, report.id, "open")}>
                        <SubmitButton>Yeniden aç</SubmitButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
