import type { BusinessBlock } from "@vado/contracts";

export type BusinessNavItem = {
  id: string;
  title: string;
  path: string;
  view?: BusinessBlock["view"];
};

/** Telefonda önce günlük işler, kalanları ise tek bir Diğer menüsü görünür. */
export function buildMobileNavigation(
  blocks: readonly BusinessBlock[],
  canMessage: boolean,
  canBook: boolean,
): { primary: BusinessNavItem[]; more: BusinessNavItem[] } {
  const unique = new Map<string, BusinessNavItem>();
  const add = (item: BusinessNavItem) => {
    if (![...unique.values()].some((previous) => previous.path === item.path)) {
      unique.set(item.id, item);
    }
  };
  for (const view of ["orders", "kitchen", "tables"] as const) {
    for (const block of blocks.filter((entry) => entry.view === view)) add(block);
  }
  if (canBook) add({ id: "bookings", title: "Randevular", path: "/bookings" });
  if (canMessage) add({ id: "chats", title: "Mesajlar", path: "/chats" });
  for (const view of ["catalog", "returns", "reviews", "devices", "branches", "settings"] as const) {
    for (const block of blocks.filter((entry) => entry.view === view)) add(block);
  }
  add({ id: "studio", title: "Mağaza tasarımı", path: "/studio" });
  if (canMessage) {
    add({ id: "channels", title: "Duyurular", path: "/channels" });
    add({ id: "team", title: "Ekibim", path: "/team" });
  }
  add({ id: "performance", title: "Performans", path: "/performance" });
  const items = [...unique.values()];
  return { primary: items.slice(0, 4), more: items.slice(4) };
}
