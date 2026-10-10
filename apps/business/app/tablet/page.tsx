import { branchSchema, operationDeviceInfoSchema, orderSchema } from "@vado/contracts";
import { redirect } from "next/navigation";
import { z } from "zod";

import { KitchenView } from "../../components/kitchen-view";
import { BusinessApiError } from "../../lib/api";
import { deviceGet } from "../../lib/device-api";
async function readTablet() {
  try {
    const device = await deviceGet(operationDeviceInfoSchema, "/v1/device/device");
    const initial = await deviceGet(
      z.object({ items: z.array(orderSchema), nextCursor: z.string().nullable() }),
      "/v1/device/queue?active=true&limit=50",
    );
    const branch = branchSchema.parse({
      id: device.branchId,
      businessId: device.businessId,
      name: device.branchName,
      address: "",
      timezone: "Europe/Istanbul",
      active: true,
      provinceId: null,
      districtId: null,
    });
    return { device, initial, branch };
  } catch (cause) {
    if (cause instanceof BusinessApiError && [401, 403].includes(cause.status))
      redirect("/kitchen-pair");
    throw cause;
  }
}

export default async function TabletPage() {
  const { device, initial, branch } = await readTablet();
  return (
    <main className="tablet-page">
      <KitchenView
        device
        businessId={device.businessId}
        appInstanceId={device.appInstanceId}
        branches={[branch]}
        initial={initial}
        title={`${device.businessName} · ${device.label}`}
      />
      <form
        action={async () => {
          "use server";
          const { clearKitchenSession } = await import("../../lib/session");
          await clearKitchenSession();
          redirect("/kitchen-pair");
        }}
      >
        <button className="secondary">Tabletten çıkış yap</button>
      </form>
    </main>
  );
}
