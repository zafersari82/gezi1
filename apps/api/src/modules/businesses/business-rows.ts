import type { Business, BusinessStatus, Category } from "@vado/contracts";

import { sql } from "../../core/database";

export interface BusinessRow {
  id: string;
  name: string;
  slug: string;
  category: Category;
  description: string;
  city: string;
  verified: boolean;
  status: BusinessStatus;
}

/** `businesses b` takma adıyla kullanılan ortak sütun listesi. */
export const BUSINESS_COLUMNS = sql`
  b.id, b.name, b.slug, b.category, b.description, b.city, b.verified, b.status
`;

/** Kullanıcılara açık işletme koşulu: hem doğrulanmış hem etkin (`businesses b`). */
export const BUSINESS_LISTED = sql`(b.status = 'active' and b.verified)`;

export function toBusiness(row: BusinessRow): Business {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    description: row.description,
    city: row.city,
    verified: row.verified,
    status: row.status,
  };
}
