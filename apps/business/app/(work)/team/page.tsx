import {
  branchSchema,
  businessRegionsSchema,
  memberAccessListSchema,
  staffInvitationsSchema,
} from "@vado/contracts";
import { redirect } from "next/navigation";
import { z } from "zod";

import { TeamView } from "../../../components/team-view";
import { visiblePermissions } from "../../../lib/access";
import { apiGet } from "../../../lib/api";
import { getBusinessContext } from "../../../lib/context";

export default async function TeamPage() {
  const { membership, resolved } = await getBusinessContext();
  if (membership.role !== "owner" && membership.role !== "manager") redirect("/orders");
  const base = `/v1/business/${membership.businessId}`;
  const isOwner = membership.role === "owner";
  const [members, branches, regions, invitations] = await Promise.all([
    apiGet(memberAccessListSchema, `${base}/access/members`),
    apiGet(z.object({ items: z.array(branchSchema) }), `${base}/branches`),
    apiGet(businessRegionsSchema, `${base}/regions`),
    isOwner
      ? apiGet(staffInvitationsSchema, `${base}/invitations`)
      : Promise.resolve({ items: [] }),
  ]);
  return (
    <TeamView
      key={membership.businessId}
      isOwner={isOwner}
      permissions={visiblePermissions(resolved?.capabilities ?? [])}
      branches={branches.items}
      regions={regions.items}
      initialMembers={members.items}
      initialInvitations={invitations.items}
    />
  );
}
