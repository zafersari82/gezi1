import { studioConfigurationResponseSchema } from "@vado/contracts";

import { SettingsView } from "../../../components/settings-view";
import { apiGet } from "../../../lib/api";
import { getBusinessContext } from "../../../lib/context";
export default async function SettingsPage() {
  const context = await getBusinessContext();
  const studio = await apiGet(
    studioConfigurationResponseSchema,
    `/v1/business/${context.membership.businessId}/studio`,
  );
  return (
    <SettingsView
      key={`${context.membership.businessId}:${context.instance?.id ?? "none"}`}
      businessId={context.membership.businessId}
      instances={context.instances}
      selectedId={context.instance?.id ?? null}
      packages={context.capabilities.packages}
      resolved={context.resolved}
      canWrite={context.membership.role !== "staff"}
      studio={studio.configuration}
    />
  );
}
