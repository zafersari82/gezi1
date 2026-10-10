import type { Branch } from "@vado/contracts";

/** Türkiye'de alışılan sırayla: mahalle, açık adres, ilçe/il. Eski serbest metin aynen gösterilir. */
export function branchAddressText(branch: Branch): string {
  const address = branch.address;
  if (address === null) return branch.legacyAddress;
  return `${address.neighborhoodName}, ${address.line}, ${address.districtName}/${address.provinceName}`;
}
