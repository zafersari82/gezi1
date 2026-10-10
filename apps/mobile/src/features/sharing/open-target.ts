import { router } from "expo-router";

import type { SharedTarget } from "./shared-target";

/** Hedef sunucudan yüklenir; bağlantı kendi başına mağaza/mini uygulama yetkisi vermez. */
export function openSharedTarget(target: SharedTarget, replace = false): void {
  if (target.kind === "order") {
    const destination = {
      pathname: "/chat/[id]/order",
      params: { id: target.conversationId, orderId: target.id },
    } as const;
    if (replace) router.replace(destination);
    else router.push(destination);
    return;
  }
  if (target.kind === "product") {
    const destination = {
      pathname: "/products/[businessId]/[branchId]/[itemId]",
      params: { businessId: target.businessId, branchId: target.branchId, itemId: target.id },
    } as const;
    if (replace) router.replace(destination);
    else router.push(destination);
    return;
  }
  if (target.kind === "business") {
    const destination = { pathname: "/businesses/[id]", params: { id: target.id } } as const;
    if (replace) router.replace(destination);
    else router.push(destination);
    return;
  }
  const destination = { pathname: "/miniapps/[id]", params: { id: target.id } } as const;
  if (replace) router.replace(destination);
  else router.push(destination);
}
