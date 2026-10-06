export type OrderFilter = "active" | "placed" | "all";

export function orderListSearch(
  filter: OrderFilter,
  states: readonly string[],
  cursor?: string,
): string {
  const query = new URLSearchParams({ limit: "100" });
  if (states.length > 0) query.set("statuses", states.join(","));
  if (filter === "active") query.set("active", "true");
  if (filter === "placed") query.set("status", "placed");
  if (cursor !== undefined) query.set("cursor", cursor);
  return query.toString();
}
