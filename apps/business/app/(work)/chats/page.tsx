import { businessChatInboxSchema } from "@vado/contracts";
import { redirect } from "next/navigation";

import { ChatsView } from "../../../components/chats-view";
import { apiGet } from "../../../lib/api";
import { getBusinessContext } from "../../../lib/context";

export default async function ChatsPage() {
  const { membership } = await getBusinessContext();
  if (membership.role !== "owner" && membership.role !== "manager") redirect("/orders");
  const initial = await apiGet(
    businessChatInboxSchema,
    `/v1/business/${membership.businessId}/chats?limit=30`,
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">VADO Business Chat</span>
          <h1>Müşteri mesajları</h1>
          <p className="muted">
            Müşteriler kendi VADO hesaplarından yazabilir. Yanıtlar mağazanız adına gönderilir.
          </p>
        </div>
      </div>
      <ChatsView initial={initial} />
    </>
  );
}
