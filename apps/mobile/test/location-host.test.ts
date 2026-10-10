import { randomUUID } from "node:crypto";

import { expect, it } from "vitest";

import { createLocationHost } from "@/features/miniapps/location-host";
const countryId = randomUUID(),
  provinceId = randomUUID(),
  districtId = randomUUID(),
  neighborhoodId = randomUUID(),
  id = randomUUID();
const body = {
  countryId,
  provinceId,
  districtId,
  neighborhoodId,
  label: "Ev",
  recipientName: "Ayşe Yılmaz",
  phone: "+905551112233",
  addressLine: "Örnek sokak 12",
  door: "3",
  note: "",
};
const address = {
  ...body,
  id,
  version: 2,
  archived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  geography: {
    country: { id: countryId, code: "TR", name: "Türkiye" },
    province: {
      id: provinceId,
      sourceId: 34,
      parentId: countryId,
      name: "İSTANBUL",
      fullOfficialName: "İSTANBUL",
    },
    district: {
      id: districtId,
      sourceId: 1,
      parentId: provinceId,
      name: "KADIKÖY",
      fullOfficialName: "KADIKÖY",
    },
    neighborhood: {
      id: neighborhoodId,
      sourceId: 1,
      parentId: districtId,
      name: "ÖRNEK",
      fullOfficialName: "ÖRNEK MAHALLESİ",
    },
  },
};
it("adres güncellemesi kimliği yola, tekrar anahtarını başlığa, sürümü gövdeye taşır", async () => {
  const calls: unknown[] = [];
  const host = createLocationHost({
    request: (method, path, payload, key) => {
      calls.push({ method, path, payload, key });
      return Promise.resolve(address);
    },
  });
  expect(await host.updateAddress({ id, key: "retry-1", expectedVersion: 1, ...body })).toEqual(
    address,
  );
  expect(calls).toEqual([
    {
      method: "PUT",
      path: `/v1/location/addresses/${id}`,
      payload: { expectedVersion: 1, ...body },
      key: "retry-1",
    },
  ]);
});
it("başka kaydın veya bozuk kataloğun yanıtı kabuktan geçmez", async () => {
  const host = createLocationHost({ request: () => Promise.resolve(address) });
  await expect(host.getAddress({ id: randomUUID() })).rejects.toThrow("Adres kimliği");
  const wrong = createLocationHost({
    request: () => Promise.resolve({ items: [address.geography.neighborhood] }),
  });
  await expect(wrong.listNeighborhoods({ districtId: randomUUID() })).rejects.toThrow("üst kaydı");
});
it("katalog, adres listesi, oluşturma ve arşivleme dar uçlara yönlenir", async () => {
  const calls: unknown[] = [];
  const host = createLocationHost({
    request: (method, path, payload, key) => {
      calls.push({ method, path, payload, key });
      if (path.endsWith("/countries"))
        return Promise.resolve({ items: [address.geography.country] });
      if (path.endsWith("/provinces"))
        return Promise.resolve({ items: [address.geography.province] });
      if (path.endsWith("/districts"))
        return Promise.resolve({ items: [address.geography.district] });
      if (path.endsWith("/neighborhoods"))
        return Promise.resolve({ items: [address.geography.neighborhood] });
      if (path.endsWith(`/neighborhoods/${neighborhoodId}`))
        return Promise.resolve(address.geography);
      return Promise.resolve(method === "GET" ? { items: [address] } : address);
    },
  });
  expect((await host.listCountries(undefined)).items[0]?.code).toBe("TR");
  await host.listProvinces({ countryId });
  await host.listDistricts({ provinceId });
  await host.listNeighborhoods({ districtId });
  await host.getNeighborhood({ id: neighborhoodId });
  expect((await host.listAddresses(undefined)).items).toHaveLength(1);
  await host.createAddress({ ...body, key: "create" });
  await host.archiveAddress({ id, key: "archive", expectedVersion: 2 });
  expect(calls).toContainEqual({
    method: "POST",
    path: "/v1/location/addresses",
    payload: body,
    key: "create",
  });
  expect(calls).toContainEqual({
    method: "POST",
    path: `/v1/location/addresses/${id}/archive`,
    payload: { expectedVersion: 2 },
    key: "archive",
  });
});
