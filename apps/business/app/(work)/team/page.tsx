import { branchSchema, businessMembershipSchema, staffInvitationsSchema } from "@vado/contracts";
import { redirect } from "next/navigation";
import { z } from "zod";

import { TeamView } from "../../../components/team-view";
import { apiGet } from "../../../lib/api";
import { getBusinessContext } from "../../../lib/context";

export default async function TeamPage() {
  const { membership } = await getBusinessContext();
  if (membership.role !== "owner") redirect("/branches");
  const response = await apiGet(z.object({ items: z.array(businessMembershipSchema) }),
    `/v1/business/${membership.businessId}/members`);
  const branches = await apiGet(z.object({ items: z.array(branchSchema) }),
    `/v1/business/${membership.businessId}/branches`);
  const invitations = await apiGet(staffInvitationsSchema,
    `/v1/business/${membership.businessId}/invitations`);
  return <TeamView key={membership.businessId} initial={response.items}
    branches={branches.items} initialInvitations={invitations.items} />;
}
