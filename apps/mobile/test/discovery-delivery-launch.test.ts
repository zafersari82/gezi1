import { beforeEach, describe, expect, it, vi } from "vitest";

const { get, post, rememberLaunch } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  rememberLaunch: vi.fn(() => "launch-123"),
}));
vi.mock("@/api/client", () => ({ api: { get, post } }));
vi.mock("@/features/miniapps/launch-params", () => ({ rememberLaunch }));
import { prepareDeliveryStoreLaunch } from "../src/features/discovery/delivery-order-launch";

const business = "550e8400-e29b-41d4-a716-446655440000";
const app = "550e8400-e29b-41d4-a716-446655440001";
const branch = "550e8400-e29b-41d4-a716-446655440002";
const address = "550e8400-e29b-41d4-a716-446655440003";

// A live delivery quote has the same schema as the shared backend contract.
const quote = {
  areaId: "550e8400-e29b-41d4-a716-446655440004",
  areaVersion: 1,
  regionVersion: 1,
  feeMinor: 4000,
  minimumMinor: 12000,
  deliveryMinutes: 35,
  preparationMinutes: 15,
  slotMinutes: 15,
  address: {
    id: address,
    version: 1,
    archived: false,
    label: "Ev",
    recipientName: "Müşteri",
    phone: "+905551112233",
    countryId: "550e8400-e29b-41d4-a716-446655440005",
    provinceId: "550e8400-e29b-41d4-a716-446655440006",
    districtId: "550e8400-e29b-41d4-a716-446655440007",
    neighborhoodId: "550e8400-e29b-41d4-a716-446655440008",
    addressLine: "Örnek sokak numara 12",
    door: "5",
    note: "",
    geography: {
      country: { id: "550e8400-e29b-41d4-a716-446655440005", code: "TR", name: "Türkiye" },
      province: {
        id: "550e8400-e29b-41d4-a716-446655440006",
        parentId: "550e8400-e29b-41d4-a716-446655440005",
        sourceId: 1,
        name: "Hatay",
        fullOfficialName: "Hatay",
      },
      district: {
        id: "550e8400-e29b-41d4-a716-446655440007",
        parentId: "550e8400-e29b-41d4-a716-446655440006",
        sourceId: 2,
        name: "Belen",
        fullOfficialName: "Belen",
      },
      neighborhood: {
        id: "550e8400-e29b-41d4-a716-446655440008",
        parentId: "550e8400-e29b-41d4-a716-446655440007",
        sourceId: 3,
        name: "Merkez",
        fullOfficialName: "Merkez",
      },
    },
    createdAt: "2026-10-10T11:00:00Z",
    updatedAt: "2026-10-10T11:00:00Z",
  },
  scheduledAt: null,
};

describe("S9: doğrulanmış teslimat açılışı", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue({ businessId: business, appInstanceId: app });
    post.mockResolvedValue(quote);
  });
  it("sunucu teklifini almadan mini uygulamayı açmaz", async () => {
    const result = await prepareDeliveryStoreLaunch(business, branch, address, "restoran");
    expect(result.launch).toBe("launch-123");
    expect(post).toHaveBeenCalledWith(`/v1/shell/${business}/${app}/delivery-quote`, {
      branchId: branch,
      addressId: address,
    });
    expect(rememberLaunch).toHaveBeenCalledTimes(1);
  });
  it("reddedilen bölge için sahte/varsayılan teslimat açılışı yapmaz", async () => {
    post.mockRejectedValue(new Error("fulfilment_unavailable"));
    await expect(
      prepareDeliveryStoreLaunch(business, branch, address, "restoran"),
    ).rejects.toThrow();
    expect(rememberLaunch).not.toHaveBeenCalled();
  });
  it("başkasının adresini veya arşivli adresi kabul etmez", async () => {
    post.mockResolvedValueOnce({ ...quote, address: { ...quote.address, id: branch } });
    await expect(
      prepareDeliveryStoreLaunch(business, branch, address, "restoran"),
    ).rejects.toThrow();
    post.mockResolvedValueOnce({ ...quote, address: { ...quote.address, archived: true } });
    await expect(
      prepareDeliveryStoreLaunch(business, branch, address, "restoran"),
    ).rejects.toThrow();
    expect(rememberLaunch).not.toHaveBeenCalled();
  });
});

describe("S10: marketin adresli sipariş açılışı", () => {
  it("alışveriş işletmesinde mağaza paketini seçer", async () => {
    const result = await prepareDeliveryStoreLaunch(business, branch, address, "magaza");
    expect(result.miniAppId).toBe("magaza");
    expect(get).toHaveBeenCalledWith(`/v1/businesses/${business}/miniapps/magaza/launch`);
    expect(rememberLaunch).toHaveBeenCalledWith(
      "magaza",
      expect.objectContaining({ delivery_branch: branch, delivery_address: address }),
      null,
      expect.any(Object),
    );
  });
});
