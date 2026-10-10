import { idSchema } from "@vado/contracts";

const UUID = "[0-9a-f-]{36}";
const patterns: Readonly<Record<string, readonly string[]>> = {
  GET: [
    "orders",
    "orders/access/me",
    "orders/performance",
    "members",
    "invitations",
    "studio",
    "studio/media/usage",
    "returns",
    "reviews",
    "kitchen-queue",
    "live-events",
    "tables",
    "table-requests",
    "kitchen-devices",
    `branches/${UUID}/availability`,
    `table-sessions/${UUID}/bill`,
    `branches/${UUID}/ordering-settings`,
    `branches/${UUID}/hours-exceptions`,
    `catalog/items/${UUID}/image`,
    `catalog/items/${UUID}/availability`,
    `catalog/items/${UUID}/menu-windows`,
    `catalog/categories/${UUID}/menu-windows`,
    `orders/${UUID}`,
    "catalog",
    "branches/availability-access/me",
    "regions",
    "regions/branches",
    `regions/${UUID}/operators`,
    `regions/${UUID}/order-grants`,
    `branches/${UUID}/order-grants`,
    `branches/${UUID}/availability-grants`,
    "branches",
    `branches/${UUID}/hours`,
    "app-instances",
    `app-instances/${UUID}/capabilities`,
  ],
  POST: [
    "studio/publish",
    "studio/media/prune",
    "socket-ticket",
    "tables",
    "kitchen-devices",
    `tables/${UUID}/qr`,
    `kitchen-devices/${UUID}/revoke`,
    `table-requests/${UUID}/resolve`,
    `table-sessions/${UUID}/close`,
    `orders/${UUID}/accept`,
    `orders/${UUID}/reject`,
    `orders/${UUID}/payment`,
    "branches",
    "regions",
    "invitations",
    `invitations/${UUID}/revoke`,
    "app-instances",
    "catalog/categories",
    "catalog/items",
    "catalog/starter-items",
    "catalog/option-groups",
  ],
  PUT: [
    "studio",
    "studio/media/usage",
    "members",
    "catalog/branch-prices",
    "branches/availability-batch",
    `regions/${UUID}`,
    `regions/${UUID}/operators`,
    `regions/${UUID}/order-grants`,
    `branches/${UUID}/order-grants`,
    `regions/branches/${UUID}`,
    `branches/${UUID}/availability-grants`,
    `orders/${UUID}/status`,
    `returns/${UUID}/decision`,
    `reviews/${UUID}/reply`,
    `tables/${UUID}`,
    `branches/${UUID}/ordering-settings`,
    `branches/${UUID}/hours-exceptions`,
    `catalog/items/${UUID}/availability`,
    `catalog/items/${UUID}/menu-windows`,
    `catalog/categories/${UUID}/menu-windows`,
    `branches/${UUID}`,
    `branches/${UUID}/hours`,
    `catalog/categories/${UUID}`,
    `catalog/items/${UUID}`,
    `catalog/items/${UUID}/prices`,
    `catalog/items/${UUID}/option-groups`,
    `catalog/option-groups/${UUID}`,
    `app-instances/${UUID}/capabilities/[a-z][a-z0-9]*(?:\\.[a-z][a-z0-9_]*)*`,
  ],
};
export function businessApiPath(
  businessId: string,
  segments: readonly string[],
  method: string,
  search: string,
): string | null {
  if (
    !idSchema.safeParse(businessId).success ||
    segments.some((s) => !/^[a-zA-Z0-9_.-]+$/.test(s) || s === "." || s === "..")
  )
    return null;
  const path = segments.join("/");
  if (!patterns[method]?.some((p) => new RegExp(`^${p}$`).test(path))) return null;
  const query = new URLSearchParams(search);
  const allowed = ["orders", "kitchen-queue"].includes(path)
    ? ["limit", "cursor", "status", "statuses", "active", "branchId", "appInstanceId"]
    : path === "orders/performance"
      ? ["days"]
    : path === "returns"
      ? ["limit", "cursor", "status"]
      : path === "reviews"
        ? ["limit", "cursor"]
        : path === "live-events"
      ? ["cursor"]
      : path.endsWith("/menu-windows")
        ? ["branchId"]
        : [];
  if ([...query.keys()].some((key) => method !== "GET" || !allowed.includes(key))) return null;
  const suffix = query.toString();
  return `/v1/business/${businessId}/${path}${suffix === "" ? "" : `?${suffix}`}`;
}
export function sameOrigin(request: Request, expectedOrigin?: string): boolean {
  return request.headers.get("origin") === new URL(expectedOrigin ?? request.url).origin;
}
export async function readLimitedJson(request: Request, maxBytes = 100_000): Promise<unknown> {
  const reader = request.body?.getReader();
  if (reader === undefined) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("İstek gövdesi çok büyük.");
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(joined);
  return text === "" ? {} : (JSON.parse(text) as unknown);
}

/** Tablet vekili, kişisel işletme uçlarına geçiş vermez. */
export function kitchenApiPath(
  segments: readonly string[],
  method: string,
  search: string,
): string | null {
  if (segments.some((s) => !/^[a-zA-Z0-9-]+$/.test(s))) return null;
  const path = segments.join("/");
  const allowed: Readonly<Record<string, readonly string[]>> = {
    GET: ["device", "queue", "orders", `orders/${UUID}`, "live-events"],
    POST: ["socket-ticket", `orders/${UUID}/accept`, `orders/${UUID}/reject`],
    PUT: [`orders/${UUID}/status`],
  };
  if (!allowed[method]?.some((p) => new RegExp(`^${p}$`).test(path))) return null;
  const query = new URLSearchParams(search);
  const keys = ["orders", "queue"].includes(path)
    ? ["limit", "cursor", "active", "status", "statuses"]
    : path === "live-events"
      ? ["cursor"]
      : [];
  if ([...query.keys()].some((k) => method !== "GET" || !keys.includes(k))) return null;
  const suffix = query.toString();
  return `/v1/kitchen/${path}${suffix === "" ? "" : `?${suffix}`}`;
}
