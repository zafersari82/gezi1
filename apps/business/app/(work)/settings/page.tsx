import { SettingsView } from "../../../components/settings-view";
import { getBusinessContext } from "../../../lib/context";
export default async function SettingsPage() {
  const context = await getBusinessContext();
  return (
    <SettingsView
      key={`${context.membership.businessId}:${context.instance?.id ?? "none"}`}
      businessId={context.membership.businessId}
      instances={context.instances}
      selectedId={context.instance?.id ?? null}
      packages={context.capabilities.packages}
      resolved={context.resolved}
      canWrite={context.membership.role !== "staff"}
    />
  );
}
