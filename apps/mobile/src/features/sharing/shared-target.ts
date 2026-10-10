/** Paylaşım URL'sinde token, müşteri kimliği, ödeme ya da fiyat taşıma. */
export type SharedTarget =
  | { kind: "business" | "miniapp"; id: string }
  | { kind: "product"; id: string; businessId: string; branchId: string }
  | { kind: "order"; id: string; conversationId: string };

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const MINI_APP_ID = "[a-z0-9][a-z0-9-]{1,38}[a-z0-9]";
const businessLink = new RegExp(`^vado:///businesses/(${UUID})$`);
const miniAppLink = new RegExp(`^vado:///miniapps/(${MINI_APP_ID})$`);
const productLink = new RegExp(`^vado:///products/(${UUID})/(${UUID})/(${UUID})$`);
const orderLink = new RegExp(`^vado:///orders/(${UUID})/(${UUID})$`);

export const MESSAGE_LINK_PATTERN =
  /(vado:\/\/\/(?:businesses\/[0-9a-fA-F-]+|miniapps\/[a-z0-9-]+|products\/[0-9a-fA-F-]+\/[0-9a-fA-F-]+\/[0-9a-fA-F-]+|orders\/[0-9a-fA-F-]+\/[0-9a-fA-F-]+)|https?:\/\/[^\s]+)/g;

export function parseSharedTarget(value: string): SharedTarget | null {
  const order = orderLink.exec(value);
  if (order?.[1] && order[2])
    return { kind: "order", conversationId: order[1].toLowerCase(), id: order[2].toLowerCase() };
  const product = productLink.exec(value);
  if (product?.[1] && product[2] && product[3]) {
    return {
      kind: "product",
      businessId: product[1].toLowerCase(),
      branchId: product[2].toLowerCase(),
      id: product[3].toLowerCase(),
    };
  }
  const business = businessLink.exec(value);
  if (business?.[1]) return { kind: "business", id: business[1].toLowerCase() };
  const miniApp = miniAppLink.exec(value);
  if (miniApp?.[1]) return { kind: "miniapp", id: miniApp[1] };
  return null;
}

export function sharedTargetUrl(target: SharedTarget): string {
  const url =
    target.kind === "product"
      ? `vado:///products/${target.businessId}/${target.branchId}/${target.id}`
      : target.kind === "order"
        ? `vado:///orders/${target.conversationId}/${target.id}`
        : `vado:///${target.kind === "business" ? "businesses" : "miniapps"}/${target.id}`;
  if (parseSharedTarget(url) === null) throw new Error("Geçersiz paylaşım hedefi");
  return url;
}

export function sharedTargetMessage(name: string, target: SharedTarget): string {
  return `${name.trim()}\n${sharedTargetUrl(target)}`;
}

/** Tek hedefli mesajlar zengin kart olarak açılır; diğer sohbet metinleri değişmez. */
export function sharedPreviewTarget(body: string): SharedTarget | null {
  const lines = body.trim().split(/\r?\n/);
  if (lines.length < 1 || lines.length > 2) return null;
  if (lines.length === 2 && (lines[0]?.trim().length ?? 0) > 100) return null;
  return parseSharedTarget(lines[lines.length - 1]?.trim() ?? "");
}
