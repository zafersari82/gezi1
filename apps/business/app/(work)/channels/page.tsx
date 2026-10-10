import { channelPageSchema } from "@vado/contracts";
import { redirect } from "next/navigation";

import { ChannelsView } from "../../../components/channels-view";
import { apiGet } from "../../../lib/api";
import { getBusinessContext } from "../../../lib/context";

/** Tek işletmenin duyuruları, işletmenin yönetim panelinden yönetilir. */
export default async function ChannelsPage() {
  const { membership } = await getBusinessContext();
  if (membership.role === "staff") redirect("/orders");
  const page = await apiGet(
    channelPageSchema,
    `/v1/business/${membership.businessId}/channel/posts?limit=20`,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">VADO Business Channels</span>
          <h1>Takipçilerine duyuru yap</h1>
          <p className="muted">
            Duyuru, işletmeni takip edenlerin akışında görünür. SMS veya toplu bildirim gönderilmez.
          </p>
        </div>
      </div>
      <ChannelsView initial={page} />
    </>
  );
}
