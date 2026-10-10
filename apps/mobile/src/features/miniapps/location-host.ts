import {
  type BridgeParams,
  type BridgeResults,
  locationAddressesSchema,
  locationAddressSchema,
  locationCountriesSchema,
  locationPathSchema,
  locationPlacesSchema,
} from "@vado/contracts";

import type { MiniAppTransport } from "./host-transport";
export type LocationHost = {
  [
    Method in Exclude<
      Extract<keyof BridgeParams, `location.${string}`>,
      "location.getCurrent"
    > as Method extends `location.${infer Name}` ? Name : never
  ]: (params: BridgeParams[Method]) => Promise<BridgeResults[Method]>;
};
/** Adres sahibi HTTP oturumudur; paket kullanıcı, işletme veya serbest URL gönderemez. */
export function createLocationHost(transport: MiniAppTransport): LocationHost {
  const base = "/v1/location";
  async function places(resource: string, id: string, children: string) {
    const result = locationPlacesSchema.parse(
      await transport.request("GET", `${base}/${resource}/${encodeURIComponent(id)}/${children}`),
    );
    if (result.items.some((place) => place.parentId !== id))
      throw new Error("Adres kataloğunun üst kaydı uyuşmuyor.");
    return result;
  }
  async function address(
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
    key?: string,
    id?: string,
  ) {
    const result = locationAddressSchema.parse(await transport.request(method, path, body, key));
    if (id !== undefined && result.id !== id) throw new Error("Adres kimliği uyuşmuyor.");
    return result;
  }
  return {
    listCountries: async () =>
      locationCountriesSchema.parse(await transport.request("GET", `${base}/countries`)),
    listProvinces: ({ countryId }) => places("countries", countryId, "provinces"),
    listDistricts: ({ provinceId }) => places("provinces", provinceId, "districts"),
    listNeighborhoods: ({ districtId }) => places("districts", districtId, "neighborhoods"),
    getNeighborhood: async ({ id }) => {
      const result = locationPathSchema.parse(
        await transport.request("GET", `${base}/neighborhoods/${encodeURIComponent(id)}`),
      );
      if (result.neighborhood.id !== id) throw new Error("Mahalle kimliği uyuşmuyor.");
      return result;
    },
    listAddresses: async () =>
      locationAddressesSchema.parse(await transport.request("GET", `${base}/addresses`)),
    getAddress: ({ id }) =>
      address("GET", `${base}/addresses/${encodeURIComponent(id)}`, undefined, undefined, id),
    createAddress: ({ key, ...body }) => address("POST", `${base}/addresses`, body, key),
    updateAddress: ({ id, key, ...body }) =>
      address("PUT", `${base}/addresses/${encodeURIComponent(id)}`, body, key, id),
    archiveAddress: ({ id, key, ...body }) =>
      address("POST", `${base}/addresses/${encodeURIComponent(id)}/archive`, body, key, id),
  };
}
