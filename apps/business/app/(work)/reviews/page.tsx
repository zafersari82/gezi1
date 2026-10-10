import { reviewSchema } from "@vado/contracts";
import { z } from "zod";

import { ReviewsView } from "../../../components/reviews-view";
import { apiGet } from "../../../lib/api";
import { getBusinessContext } from "../../../lib/context";

export default async function ReviewsPage() {
  const { membership } = await getBusinessContext();
  const initial = await apiGet(
    z.object({ items: z.array(reviewSchema), nextCursor: z.string().nullable() }),
    `/v1/business/${membership.businessId}/reviews?limit=30`,
  );
  return (
    <ReviewsView
      key={membership.businessId}
      initial={initial}
      canReply={membership.role !== "staff"}
    />
  );
}
