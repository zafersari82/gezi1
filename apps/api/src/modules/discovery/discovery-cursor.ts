import { createHash } from "node:crypto";

import type { DiscoveryQuery } from "@vado/contracts";

import { AppError } from "../../core/errors";

/** Sayfalama anahtarı yalnız sıralama konumudur; erişim yetkisi vermez. */
export interface DiscoveryPosition {
  score: number;
  nameKey: string;
  kind: "business" | "miniapp";
  recordId: string;
}

function fingerprint(query: DiscoveryQuery): string {
  return createHash("sha256")
    .update(JSON.stringify([query.q.trim().replace(/\s+/g, " "), query.category ?? "", query.kind, query.provinceId ?? "", query.districtId ?? ""]))
    .digest("hex")
    .slice(0, 24);
}

export function encodeDiscoveryCursor(query: DiscoveryQuery, position: DiscoveryPosition): string {
  return Buffer.from(JSON.stringify({ v: 1, f: fingerprint(query), ...position })).toString("base64url");
}

export function decodeDiscoveryCursor(query: DiscoveryQuery): DiscoveryPosition | null {
  if (query.cursor === undefined) return null;
  try {
    // Sözleşmede uzunluk üst sınırı var; okunamayan veya bağlamı farklı imleç reddedilir.
    const data: unknown = JSON.parse(Buffer.from(query.cursor, "base64url").toString("utf8"));
    if (typeof data !== "object" || data === null) throw new Error("invalid_cursor");
    const cursor = data as Record<string, unknown>;
    if (
      cursor.v !== 1 || cursor.f !== fingerprint(query) ||
      !Number.isInteger(cursor.score) || (cursor.score as number) < 0 || (cursor.score as number) > 3 ||
      typeof cursor.nameKey !== "string" || cursor.nameKey.length > 256 ||
      (cursor.kind !== "business" && cursor.kind !== "miniapp") ||
      typeof cursor.recordId !== "string" || cursor.recordId.length > 60 ||
      !/^[a-z0-9-]+$/.test(cursor.recordId)
    ) throw new Error("invalid_cursor");
    return {
      score: cursor.score as number,
      nameKey: cursor.nameKey,
      kind: cursor.kind,
      recordId: cursor.recordId,
    };
  } catch {
    throw new AppError("validation_failed");
  }
}
