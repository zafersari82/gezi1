import {
  catalogCategoryBodySchema,
  catalogItemBodySchema,
  catalogOptionGroupBodySchema,
} from "@vado/contracts";

import type { TestApp } from "./harness";
import { createTenantFixture } from "./tenant-fixture";

export async function createCatalogFixture(app: TestApp) {
  const f = await createTenantFixture(app);
  const category = await app.services.catalog.saveCategory(
    f.scope,
    catalogCategoryBodySchema.parse({ name: "Ürünler" }),
  );
  const item = await app.services.catalog.saveItem(
    f.scope,
    catalogItemBodySchema.parse({
      name: "Örnek ürün",
      categoryId: category.id,
      price: { amountMinor: 10000, vatBasisPoints: 1000 },
    }),
  );
  const group = await app.services.catalog.saveOptionGroup(
    f.scope,
    catalogOptionGroupBodySchema.parse({
      name: "Ekstralar",
      options: [{ name: "Ek ürün", priceDeltaMinor: 2500 }],
    }),
  );
  await app.services.catalog.setOptionGroups(f.scope, item.id, [group.id]);
  const option = group.options[0];
  if (option === undefined) throw new Error("Sınama seçeneği oluşmadı");
  return { ...f, itemId: item.id, categoryId: category.id, groupId: group.id, optionId: option.id };
}
