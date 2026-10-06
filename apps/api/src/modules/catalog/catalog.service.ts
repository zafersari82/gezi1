import type {
  Catalog,
  CatalogCategoryBody,
  CatalogItemBody,
  CatalogOptionGroupBody,
  CatalogPriceBody,
  CatalogSelection,
  PricedLine,
} from "@vado/contracts";

import type { TenantContext } from "../../core/context";
import { type Database, isUniqueViolation, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { requireBusinessRole, type TenantScope, withTenant } from "../../core/tenant-scope";
import { includedVat } from "./pricing";

interface CategoryRow {
  id: string;
  business_id: string;
  name: string;
  sort_order: number;
  active: boolean;
}
interface ItemRow {
  id: string;
  business_id: string;
  category_id: string | null;
  name: string;
  description: string;
  sku: string | null;
  active: boolean;
  available: boolean;
  version: number;
}
interface GroupRow {
  id: string;
  business_id: string;
  name: string;
  min_selected: number;
  max_selected: number;
  active: boolean;
}
interface OptionRow {
  id: string;
  group_id: string;
  name: string;
  price_delta_minor: number;
  sort_order: number;
  active: boolean;
}
interface PriceRow {
  id: string;
  item_id: string;
  branch_id: string | null;
  amount_minor: number;
  vat_basis_points: number;
  currency: "TRY";
}

const MANAGERS = ["owner", "manager"] as const;
const TOTAL_LIMIT_MINOR = 100_000_000;

function toItem(row: ItemRow, groupIds: string[]) {
  return {
    id: row.id,
    businessId: row.business_id,
    categoryId: row.category_id,
    name: row.name,
    description: row.description,
    sku: row.sku,
    active: row.active,
    available: row.available,
    version: row.version,
    optionGroupIds: groupIds,
  };
}
function toOption(row: OptionRow) {
  return {
    id: row.id,
    groupId: row.group_id,
    name: row.name,
    priceDeltaMinor: row.price_delta_minor,
    sortOrder: row.sort_order,
    active: row.active,
  };
}
function toGroup(row: GroupRow, options: OptionRow[]) {
  return {
    id: row.id,
    businessId: row.business_id,
    name: row.name,
    minSelected: row.min_selected,
    maxSelected: row.max_selected,
    active: row.active,
    options: options.map(toOption),
  };
}

async function readCatalog(tx: Database, scope: TenantScope, lock = false): Promise<Catalog> {
  const clause = lock ? sql`for share` : sql.empty;
  const categories = await tx.many<CategoryRow>(sql`
    select * from catalog_categories where business_id = ${scope.businessId} order by sort_order, id ${clause}
  `);
  const items = await tx.many<ItemRow>(sql`
    select * from catalog_items where business_id = ${scope.businessId} order by id ${clause}
  `);
  const groups = await tx.many<GroupRow>(sql`
    select * from option_groups where business_id = ${scope.businessId} order by id ${clause}
  `);
  const options = await tx.many<OptionRow>(sql`
    select * from options where business_id = ${scope.businessId} order by group_id, sort_order, id ${clause}
  `);
  const links = await tx.many<{ item_id: string; group_id: string }>(sql`
    select * from item_option_groups where business_id = ${scope.businessId} order by item_id, sort_order, group_id ${clause}
  `);
  const prices = await tx.many<PriceRow>(sql`
    select * from prices where business_id = ${scope.businessId} order by id ${clause}
  `);
  return {
    categories: categories.map((row) => ({
      id: row.id,
      businessId: row.business_id,
      name: row.name,
      sortOrder: row.sort_order,
      active: row.active,
    })),
    items: items.map((row) =>
      toItem(
        row,
        links.filter((link) => link.item_id === row.id).map((link) => link.group_id),
      ),
    ),
    optionGroups: groups.map((row) =>
      toGroup(
        row,
        options.filter((option) => option.group_id === row.id),
      ),
    ),
    prices: prices.map((row) => ({
      id: row.id,
      itemId: row.item_id,
      branchId: row.branch_id,
      amountMinor: row.amount_minor,
      vatBasisPoints: row.vat_basis_points,
      currency: row.currency,
    })),
  };
}

async function requireItem(tx: Database, scope: TenantScope, id: string): Promise<void> {
  const row = await tx.maybeOne(
    sql`select id from catalog_items where business_id = ${scope.businessId} and id = ${id} for update`,
  );
  if (row === null) throw new AppError("not_found");
}

async function writePrice(
  tx: Database,
  scope: TenantScope,
  itemId: string,
  body: CatalogPriceBody,
): Promise<void> {
  if (body.branchId !== null) {
    const branch = await tx.maybeOne(
      sql`select id from branches where business_id = ${scope.businessId} and id = ${body.branchId}`,
    );
    if (branch === null) throw new AppError("not_found");
  }
  if (body.branchId === null) {
    await tx.execute(sql`
      insert into prices(business_id, item_id, amount_minor, vat_basis_points)
      values (${scope.businessId}, ${itemId}, ${body.amountMinor}, ${body.vatBasisPoints})
      on conflict (business_id, item_id) where branch_id is null
      do update set amount_minor = excluded.amount_minor, vat_basis_points = excluded.vat_basis_points
    `);
  } else {
    await tx.execute(sql`
      insert into prices(business_id, item_id, branch_id, amount_minor, vat_basis_points)
      values (${scope.businessId}, ${itemId}, ${body.branchId}, ${body.amountMinor}, ${body.vatBasisPoints})
      on conflict (business_id, item_id, branch_id) where branch_id is not null
      do update set amount_minor = excluded.amount_minor, vat_basis_points = excluded.vat_basis_points
    `);
  }
}

export function createCatalogService({ db }: TenantContext) {
  function get(scope: TenantScope): Promise<Catalog> {
    return withTenant(db, scope, (tx) => readCatalog(tx, scope));
  }

  async function saveCategory(scope: TenantScope, body: CatalogCategoryBody, id?: string) {
    requireBusinessRole(scope, MANAGERS);
    try {
      return await withTenant(db, scope, async (tx) => {
        const row =
          id === undefined
            ? await tx.one<CategoryRow>(sql`
          insert into catalog_categories(business_id, name, sort_order, active)
          values (${scope.businessId}, ${body.name}, ${body.sortOrder}, ${body.active}) returning *
        `)
            : await tx.maybeOne<CategoryRow>(sql`
          update catalog_categories set name = ${body.name}, sort_order = ${body.sortOrder}, active = ${body.active}
          where business_id = ${scope.businessId} and id = ${id} returning *
        `);
        if (row === null) throw new AppError("not_found");
        return {
          id: row.id,
          businessId: row.business_id,
          name: row.name,
          sortOrder: row.sort_order,
          active: row.active,
        };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError("validation_failed");
      throw error;
    }
  }

  async function saveItem(scope: TenantScope, body: CatalogItemBody, id?: string) {
    requireBusinessRole(scope, MANAGERS);
    try {
      return await withTenant(db, scope, async (tx) => {
        if (body.categoryId !== null) {
          const category = await tx.maybeOne(sql`
            select id from catalog_categories where business_id = ${scope.businessId} and id = ${body.categoryId}
          `);
          if (category === null) throw new AppError("not_found");
        }
        const row =
          id === undefined
            ? await tx.one<ItemRow>(sql`
          insert into catalog_items(business_id, category_id, name, description, sku, active, available)
          values (${scope.businessId}, ${body.categoryId}, ${body.name}, ${body.description}, ${body.sku}, ${body.active}, ${body.available}) returning *
        `)
            : await tx.maybeOne<ItemRow>(sql`
          update catalog_items set category_id = ${body.categoryId}, name = ${body.name}, description = ${body.description},
            sku = ${body.sku}, active = ${body.active}, available = ${body.available}
          where business_id = ${scope.businessId} and id = ${id} returning *
        `);
        if (row === null) throw new AppError("not_found");
        await writePrice(tx, scope, row.id, body.price);
        const links = await tx.many<{ group_id: string }>(sql`
          select group_id from item_option_groups where business_id = ${scope.businessId} and item_id = ${row.id} order by sort_order, group_id
        `);
        return toItem(
          row,
          links.map((link) => link.group_id),
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new AppError("validation_failed");
      throw error;
    }
  }

  async function savePrice(
    scope: TenantScope,
    itemId: string,
    body: CatalogPriceBody,
  ): Promise<void> {
    requireBusinessRole(scope, MANAGERS);
    await withTenant(db, scope, async (tx) => {
      await requireItem(tx, scope, itemId);
      await writePrice(tx, scope, itemId, body);
    });
  }

  async function saveOptionGroup(scope: TenantScope, body: CatalogOptionGroupBody, id?: string) {
    requireBusinessRole(scope, MANAGERS);
    return withTenant(db, scope, async (tx) => {
      const row =
        id === undefined
          ? await tx.one<GroupRow>(sql`
        insert into option_groups(business_id, name, min_selected, max_selected, active)
        values (${scope.businessId}, ${body.name}, ${body.minSelected}, ${body.maxSelected}, ${body.active}) returning *
      `)
          : await tx.maybeOne<GroupRow>(sql`
        update option_groups set name = ${body.name}, min_selected = ${body.minSelected},
          max_selected = ${body.maxSelected}, active = ${body.active}
        where business_id = ${scope.businessId} and id = ${id} returning *
      `);
      if (row === null) throw new AppError("not_found");
      if (id === undefined && body.options.some((option) => option.id !== undefined))
        throw new AppError("validation_failed");
      const retained = body.options.flatMap((option) =>
        option.id === undefined ? [] : [option.id],
      );
      await tx.execute(sql`
        update options set active = false where business_id = ${scope.businessId} and group_id = ${row.id}
          and not (id = any(${retained}::uuid[]))
      `);
      for (const option of body.options) {
        if (option.id === undefined) {
          await tx.execute(sql`
            insert into options(business_id, group_id, name, price_delta_minor, active, sort_order)
            values (${scope.businessId}, ${row.id}, ${option.name}, ${option.priceDeltaMinor}, ${option.active}, ${option.sortOrder})
          `);
        } else {
          const count = await tx.execute(sql`
            update options set name = ${option.name}, price_delta_minor = ${option.priceDeltaMinor},
              active = ${option.active}, sort_order = ${option.sortOrder}
            where business_id = ${scope.businessId} and group_id = ${row.id} and id = ${option.id}
          `);
          if (count !== 1) throw new AppError("not_found");
        }
      }
      const options = await tx.many<OptionRow>(sql`
        select * from options where business_id = ${scope.businessId} and group_id = ${row.id} order by sort_order, id
      `);
      return toGroup(row, options);
    });
  }

  async function setOptionGroups(
    scope: TenantScope,
    itemId: string,
    groupIds: string[],
  ): Promise<void> {
    requireBusinessRole(scope, MANAGERS);
    await withTenant(db, scope, async (tx) => {
      await requireItem(tx, scope, itemId);
      const groups = await tx.many<{ id: string }>(sql`
        select id from option_groups where business_id = ${scope.businessId} and id = any(${groupIds}::uuid[])
      `);
      if (groups.length !== groupIds.length) throw new AppError("not_found");
      await tx.execute(
        sql`delete from item_option_groups where business_id = ${scope.businessId} and item_id = ${itemId}`,
      );
      for (const [index, groupId] of groupIds.entries()) {
        await tx.execute(sql`
          insert into item_option_groups(business_id, item_id, group_id, sort_order)
          values (${scope.businessId}, ${itemId}, ${groupId}, ${index})
        `);
      }
    });
  }

  function quote(
    tx: Database,
    scope: TenantScope,
    branchId: string,
    selections: CatalogSelection[],
    at = new Date(),
  ) {
    return withTenant(tx, scope, async (connection) => {
      const branch = await connection.maybeOne<{ active: boolean }>(sql`
        select active from branches where business_id = ${scope.businessId} and id = ${branchId} for share
      `);
      if (branch === null) throw new AppError("not_found");
      const catalog = await readCatalog(connection, scope, true);
      const served = await connection.many<{ id: string; available: boolean }>(sql`
        select id,catalog_item_served_at(${scope.businessId},${branchId},id,${at}) as available
        from catalog_items where business_id=${scope.businessId}
      `);
      const lines: PricedLine[] = selections.map((selection) => {
        const item = catalog.items.find((candidate) => candidate.id === selection.itemId);
        const price =
          catalog.prices.find(
            (candidate) => candidate.itemId === selection.itemId && candidate.branchId === branchId,
          ) ??
          catalog.prices.find(
            (candidate) => candidate.itemId === selection.itemId && candidate.branchId === null,
          );
        const groups =
          item === undefined
            ? []
            : catalog.optionGroups.filter((group) => item.optionGroupIds.includes(group.id));
        const allowedOptions = groups.flatMap((group) =>
          group.active ? group.options.filter((option) => option.active) : [],
        );
        const options = selection.optionIds.map((id) => {
          const option = allowedOptions.find((candidate) => candidate.id === id);
          return {
            id,
            name: option?.name ?? "Kullanılamayan seçenek",
            priceDeltaMinor: option?.priceDeltaMinor ?? 0,
          };
        });
        const choicesValid =
          groups
            .filter((group) => group.active)
            .every((group) => {
              const count = group.options.filter(
                (option) => option.active && selection.optionIds.includes(option.id),
              ).length;
              return count >= group.minSelected && count <= group.maxSelected;
            }) &&
          selection.optionIds.every((id) => allowedOptions.some((option) => option.id === id));
        const categoryActive =
          item?.categoryId === null ||
          catalog.categories.some(
            (category) => category.id === item?.categoryId && category.active,
          );
        const unitPriceMinor =
          (price?.amountMinor ?? 0) +
          options.reduce((total, option) => total + option.priceDeltaMinor, 0);
        const totalMinor = unitPriceMinor * selection.quantity;
        if (!Number.isSafeInteger(totalMinor) || totalMinor > TOTAL_LIMIT_MINOR)
          throw new AppError("validation_failed");
        const vatBasisPoints = price?.vatBasisPoints ?? 0;
        return {
          ...selection,
          name: item?.name ?? "Kullanılamayan ürün",
          options,
          unitPriceMinor,
          totalMinor,
          vatBasisPoints,
          vatMinor: includedVat(totalMinor, vatBasisPoints),
          available:
            branch.active &&
            item?.active === true &&
            item.available &&
            served.some((row) => row.id === item.id && row.available) &&
            categoryActive &&
            price !== undefined &&
            choicesValid,
        };
      });
      const totalMinor = lines.reduce((total, line) => total + line.totalMinor, 0);
      if (totalMinor > TOTAL_LIMIT_MINOR) throw new AppError("validation_failed");
      return {
        lines,
        totalMinor,
        vatMinor: lines.reduce((total, line) => total + line.vatMinor, 0),
      };
    });
  }

  function preview(scope: TenantScope, branchId: string, selections: CatalogSelection[]) {
    return quote(db, scope, branchId, selections);
  }

  function customerCatalog(
    scope: TenantScope,
    branchId: string,
    options: { includeUnavailable?: boolean; at?: string } = {},
  ): Promise<Catalog> {
    if (scope.role !== "customer" || scope.appInstanceId === null) throw new AppError("forbidden");
    return withTenant(db, scope, async (tx) => {
      const branch = await tx.maybeOne(
        sql`select 1 from branches where business_id = ${scope.businessId} and id = ${branchId} and active`,
      );
      if (branch === null) throw new AppError("not_found");
      const catalog = await readCatalog(tx, scope);
      const served = await tx.many<{ id: string; available: boolean }>(sql`
        select id,catalog_item_served_at(${scope.businessId},${branchId},id,${options.at ?? new Date().toISOString()}) as available
        from catalog_items where business_id=${scope.businessId}
      `);
      const categories = catalog.categories.filter((category) => category.active);
      const optionGroups = catalog.optionGroups
        .filter((group) => group.active)
        .map((group) => ({ ...group, options: group.options.filter((option) => option.active) }));
      const items = catalog.items
        .map((item) => ({
          ...item,
          available: served.some((row) => row.id === item.id && row.available),
        }))
        .filter(
          (item) =>
            item.active &&
            (options.includeUnavailable === true || item.available) &&
            (item.categoryId === null ||
              categories.some((category) => category.id === item.categoryId)),
        )
        .map((item) => ({
          ...item,
          optionGroupIds: item.optionGroupIds.filter((id) =>
            optionGroups.some((group) => group.id === id),
          ),
        }));
      const prices = catalog.prices.filter(
        (price) =>
          items.some((item) => item.id === price.itemId) &&
          (price.branchId === null || price.branchId === branchId),
      );
      const publishedItems = items.filter((item) =>
        prices.some((price) => price.itemId === item.id),
      );
      return {
        categories,
        items: publishedItems,
        optionGroups: optionGroups.filter((group) =>
          publishedItems.some((item) => item.optionGroupIds.includes(group.id)),
        ),
        prices,
      };
    });
  }

  return {
    get,
    saveCategory,
    saveItem,
    savePrice,
    saveOptionGroup,
    setOptionGroups,
    quote,
    preview,
    customerCatalog,
  };
}

export type CatalogService = ReturnType<typeof createCatalogService>;
