import { deadEventSchema, listOf } from "@vado/contracts";
import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { SubmitButton } from "@/components/submit-button";
import { retryEvent } from "@/lib/actions";
import { adminGet, getMe } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Olay teslimleri" };
export default async function EventsPage() {
  const [{ items }, me] = await Promise.all([
    adminGet(listOf(deadEventSchema), "/v1/admin/events/dead"),
    getMe(),
  ]);
  return (
    <>
      <PageHeader
        title="Olay teslimleri"
        lead="Tekrar sınırına ulaşmış teslimleri burada görürsün. Alıcıdaki sorunu giderdikten sonra aynı olay kimliğiyle yeniden deneyebilirsin."
      />
      <div className="panel table-scroll">
        {items.length === 0 ? (
          <p className="empty">Bekleyen ölü olay yok.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th scope="col">Zaman</th>
                <th scope="col">Olay</th>
                <th scope="col">İşletme</th>
                <th scope="col">Deneme</th>
                <th scope="col">İşlem</th>
              </tr>
            </thead>
            <tbody>
              {items.map((event) => (
                <tr key={event.id}>
                  <td>{formatDateTime(event.createdAt)}</td>
                  <td>
                    {event.type}
                    <span className="cell-sub mono">{event.id}</span>
                  </td>
                  <td className="mono">{event.businessId ?? "Platform"}</td>
                  <td>{event.attempts}</td>
                  <td>
                    {me.permissions.includes("events.retry") && (
                      <form action={retryEvent.bind(null, event.queue, event.id)}>
                        <SubmitButton>Yeniden dene</SubmitButton>
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
