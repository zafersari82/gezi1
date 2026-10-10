import { expect, test } from "vitest";

import { locationAddressSchema, locationPathSchema } from "../src";

const COUNTRY_ID = "10000000-0000-4000-8000-000000000001";
const PROVINCE_ID = "10000000-0000-4000-8000-000000000002";
const DISTRICT_ID = "10000000-0000-4000-8000-000000000003";
const NEIGHBORHOOD_ID = "10000000-0000-4000-8000-000000000004";
const FOREIGN_ID = "10000000-0000-4000-8000-000000000005";
const geography = {
  country: { id: COUNTRY_ID, code: "TR", name: "Türkiye" },
  province: {
    id: PROVINCE_ID,
    sourceId: 34,
    parentId: COUNTRY_ID,
    name: "İstanbul",
    fullOfficialName: "İstanbul",
  },
  district: {
    id: DISTRICT_ID,
    sourceId: 1,
    parentId: PROVINCE_ID,
    name: "Kadıköy",
    fullOfficialName: "Kadıköy",
  },
  neighborhood: {
    id: NEIGHBORHOOD_ID,
    sourceId: 2,
    parentId: DISTRICT_ID,
    name: "Caferağa",
    fullOfficialName: "Caferağa Mahallesi",
  },
};

test("coğrafya yanıtı il, ilçe ve mahalle üst bağlantılarının tamamını doğrular", () => {
  expect(locationPathSchema.safeParse(geography).success).toBe(true);
  for (const level of ["province", "district", "neighborhood"] as const) {
    expect(
      locationPathSchema.safeParse({
        ...geography,
        [level]: { ...geography[level], parentId: FOREIGN_ID },
      }).success,
    ).toBe(false);
  }
});

test("adres kimlikleri açılmış coğrafyanın ülke, il, ilçe ve mahallesiyle aynı olmalıdır", () => {
  const address = {
    id: FOREIGN_ID,
    version: 1,
    archived: false,
    label: "Ev",
    recipientName: "Adres sahibi",
    phone: "+905551112233",
    countryId: COUNTRY_ID,
    provinceId: PROVINCE_ID,
    districtId: DISTRICT_ID,
    neighborhoodId: NEIGHBORHOOD_ID,
    addressLine: "Örnek sokak 12",
    door: "3",
    note: "",
    geography,
    createdAt: "2026-10-07T12:00:00Z",
    updatedAt: "2026-10-07T12:00:00Z",
  };
  expect(locationAddressSchema.safeParse(address).success).toBe(true);
  for (const field of ["countryId", "provinceId", "districtId", "neighborhoodId"] as const) {
    expect(locationAddressSchema.safeParse({ ...address, [field]: FOREIGN_ID }).success).toBe(
      false,
    );
  }
});
