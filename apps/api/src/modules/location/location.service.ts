import type { TenantContext } from "../../core/context";
import { createLocationAddresses } from "./location-addresses";
import { createLocationAreas } from "./location-areas";
import { createLocationCatalog } from "./location-catalog";
export function createLocationService({ db }: TenantContext) {
  return {
    ...createLocationCatalog(db),
    ...createLocationAddresses(db),
    ...createLocationAreas(db),
  };
}
