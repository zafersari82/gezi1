import { expect, it } from "vitest";

import {
  KITCHEN_MANIFEST,
  PICKUP_MANIFEST,
  SCHEDULING_MANIFEST,
  TABLE_SERVICE_MANIFEST,
} from "../src/modules/capabilities/capabilities.registry";
it("restoran manifestleri gerçek uçları ve teslim edilen olayları ilan eder", () => {
  expect(KITCHEN_MANIFEST.api.map((a) => a.path)).toContain("/v1/device/queue");
  expect(KITCHEN_MANIFEST.api.map((a) => a.path)).toContain("/v1/device/orders/:id/reject");
  expect(TABLE_SERVICE_MANIFEST.events.publishes).toContain("table.requested");
  expect(TABLE_SERVICE_MANIFEST.api.map((a) => a.path)).toContain(
    "/v1/business/:businessId/orders/:id/payment",
  );
  expect(PICKUP_MANIFEST.api.length).toBeGreaterThan(0);
  expect(SCHEDULING_MANIFEST.api.map((a) => a.path)).toContain(
    "/v1/shell/:businessId/:appInstanceId/fulfilment-slots",
  );
});
