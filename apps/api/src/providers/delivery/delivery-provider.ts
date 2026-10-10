import type {
  CourierJob,
  CourierJobContact,
  CourierPaymentBody,
  CourierStepBody,
  DeliveryAssignmentBody,
} from "@vado/contracts";

import type { TenantScope } from "../../core/tenant-scope";
/** Sağlayıcıya özgü aktör ve iş türleri motorun durum makinesine taşınmaz. */
export interface CourierScope {
  readonly businessId: string;
  readonly userId: string;
  readonly memberId: string;
}
export interface DeliveryProvider {
  readonly id: string;
  assign: (
    scope: TenantScope,
    orderId: string,
    key: string,
    body: DeliveryAssignmentBody,
  ) => Promise<CourierJob>;
  authorise: (userId: string, businessId: string) => Promise<CourierScope>;
  jobs: (scope: CourierScope) => Promise<CourierJob[]>;
  job: (scope: CourierScope, id: string) => Promise<CourierJobContact>;
  mutate: (
    scope: CourierScope,
    id: string,
    key: string,
    operation: "depart" | "deliver" | "payment",
    body: CourierStepBody | CourierPaymentBody,
  ) => Promise<CourierJob>;
}
