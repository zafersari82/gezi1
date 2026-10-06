"use client";

import {
  type Branch,
  type Catalog,
  catalogCategoryBodySchema,
  catalogCategorySchema,
  catalogItemBodySchema,
  catalogItemSchema,
  catalogOptionGroupBodySchema,
  catalogOptionGroupSchema,
  catalogPriceBodySchema,
  catalogSchema,
} from "@vado/contracts";
import { useState } from "react";
import { z } from "zod";

import { call, errorMessage } from "../lib/client";
import { decimalToMinor, formText, money } from "../lib/values";
import { MenuOperations } from "./menu-operations";

type Item = Catalog["items"][number];
type Group = Catalog["optionGroups"][number];
type Category = Catalog["categories"][number];
type Mutation = (run: () => Promise<void>) => Promise<void>;
export function CatalogView({
  initial,
  branches,
  canWrite,
}: {
  initial: Catalog;
  branches: Branch[];
  canWrite: boolean;
}) {
  const [catalog, setCatalog] = useState(initial);
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState("items");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const mutate: Mutation = async (run) => {
    setBusy(true);
    setError("");
    setSaved(false);
    try {
      await run();
      setCatalog(await call(catalogSchema, "/api/business/catalog"));
      setRevision((value) => value + 1);
      setSaved(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const item = catalog.items.find((i) => i.id === selectedId);
  const category = catalog.categories.find((i) => i.id === selectedId);
  const group = catalog.optionGroups.find((i) => i.id === selectedId);
  const data =
    tab === "items"
      ? catalog.items
      : tab === "categories"
        ? catalog.categories
        : catalog.optionGroups;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">Ortak katalog</span>
          <h1>Ürünler</h1>
          <p className="muted">Ürünlerini, fiyatlarını ve seçeneklerini yönet.</p>
        </div>
      </div>
      <div className="toolbar">
        <div className="tabs">
          {[
            ["items", "Ürünler"],
            ["categories", "Kategoriler"],
            ["groups", "Seçenekler"],
          ].map(([value, label]) => (
            <button
              key={value}
              disabled={busy}
              className={tab === value ? "selected" : ""}
              onClick={() => {
                setTab(value ?? "items");
                setSelectedId(null);
                setSearch("");
                setSaved(false);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {canWrite && (
          <button
            className="primary"
            disabled={busy}
            onClick={() => {
              setSelectedId(null);
              setSaved(false);
            }}
          >
            Yeni ekle
          </button>
        )}
      </div>
      {!canWrite && (
        <p className="notice">
          Kataloğu görebilirsin. Düzenleme için işletme sahibi veya yönetici yetkisi gerekir.
        </p>
      )}
      {error !== "" && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="success">
          Değişikliklerin kaydedildi.
        </p>
      )}
      <div className="editor-layout">
        <section className="panel">
          <label className="search">
            Katalogda ara
            <input
              type="search"
              placeholder="Ada göre ara"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
            />
          </label>
          {data
            .filter((entry) =>
              entry.name.toLocaleLowerCase("tr-TR").includes(search.toLocaleLowerCase("tr-TR")),
            )
            .map((entry) => (
              <div className="item-row" key={entry.id}>
                <div>
                  <strong>{entry.name}</strong>
                  <span className="muted small">
                    {entry.active ? "Etkin" : "Arşivde"}
                    {tab === "items" &&
                      ` · ${money(catalog.prices.find((p) => p.itemId === entry.id && p.branchId === null)?.amountMinor ?? 0)}`}
                  </span>
                </div>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => {
                    setSelectedId(entry.id);
                    setSaved(false);
                  }}
                >
                  {canWrite ? "Düzenle" : "Görüntüle"}
                </button>
              </div>
            ))}
          {data.length === 0 && (
            <div className="empty">
              <h2>Kataloğun burada büyüyecek.</h2>
              <p>İlk kaydını sağdaki formdan ekle.</p>
            </div>
          )}
        </section>
        <section className="panel">
          <fieldset disabled={!canWrite || busy} className="editor-fieldset">
            {tab === "items" && (
              <>
                <ProductForm
                  key={`${item?.id ?? "new"}:${revision}`}
                  item={item}
                  catalog={catalog}
                  mutate={mutate}
                  onSaved={setSelectedId}
                />
                {item !== undefined && (
                  <>
                    <div className="subpanel">
                      <h3>Ürünün seçenek grupları</h3>
                      <form
                        key={`${item.id}:${revision}`}
                        onSubmit={(event) => {
                          event.preventDefault();
                          const data = new FormData(event.currentTarget);
                          void mutate(async () => {
                            await call(
                              z.null(),
                              `/api/business/catalog/items/${item.id}/option-groups`,
                              "PUT",
                              {
                                groupIds: data
                                  .getAll("groupIds")
                                  .filter((v): v is string => typeof v === "string"),
                              },
                            );
                          });
                        }}
                      >
                        <div className="chip-list">
                          {catalog.optionGroups.map((g) => (
                            <label className="check-label" key={g.id}>
                              <input
                                type="checkbox"
                                name="groupIds"
                                value={g.id}
                                defaultChecked={item.optionGroupIds.includes(g.id)}
                              />
                              {g.name}
                            </label>
                          ))}
                        </div>
                        <button className="secondary">Seçenekleri kaydet</button>
                      </form>
                    </div>
                    <MenuOperations
                      key={`menu-${item.id}`}
                      id={item.id}
                      kind="item"
                      branches={branches}
                    />
                    <PriceForm
                      key={`prices-${item.id}`}
                      item={item}
                      catalog={catalog}
                      branches={branches}
                      mutate={mutate}
                    />
                  </>
                )}
              </>
            )}
            {tab === "categories" && (
              <CategoryForm
                key={`${category?.id ?? "new"}:${revision}`}
                category={category}
                mutate={mutate}
                onSaved={setSelectedId}
              />
            )}
            {tab === "groups" && (
              <GroupForm
                key={`${group?.id ?? "new"}:${revision}`}
                group={group}
                mutate={mutate}
                onSaved={setSelectedId}
              />
            )}
            {tab === "categories" && category && (
              <MenuOperations
                key={`menu-${category.id}`}
                id={category.id}
                kind="category"
                branches={branches}
              />
            )}
          </fieldset>
        </section>
      </div>
    </>
  );
}
function ProductForm({
  item,
  catalog,
  mutate,
  onSaved,
}: {
  item?: Item;
  catalog: Catalog;
  mutate: Mutation;
  onSaved: (id: string) => void;
}) {
  const price = catalog.prices.find((p) => p.itemId === item?.id && p.branchId === null);
  return (
    <>
      <div className="section-heading">
        <h2>{item === undefined ? "Yeni ürün" : "Ürünü düzenle"}</h2>
      </div>
      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void mutate(async () => {
            const body = catalogItemBodySchema.parse({
              name: formText(data, "name"),
              description: formText(data, "description"),
              categoryId: formText(data, "categoryId") || null,
              sku: formText(data, "sku") || null,
              active: data.has("active"),
              available: data.has("available"),
              price: {
                branchId: null,
                amountMinor: decimalToMinor(formText(data, "price")),
                vatBasisPoints: decimalToMinor(formText(data, "vat")),
              },
            });
            const result = await call(
              catalogItemSchema,
              item === undefined
                ? "/api/business/catalog/items"
                : `/api/business/catalog/items/${item.id}`,
              item === undefined ? "POST" : "PUT",
              body,
            );
            onSaved(result.id);
          });
        }}
      >
        <label className="full">
          Ürün adı
          <input name="name" maxLength={80} required defaultValue={item?.name} />
        </label>
        <label className="full">
          Açıklama
          <textarea name="description" maxLength={1000} defaultValue={item?.description} />
        </label>
        <label>
          Kategori
          <select name="categoryId" defaultValue={item?.categoryId ?? ""}>
            <option value="">Kategorisiz</option>
            {catalog.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Ürün kodu
          <input name="sku" maxLength={80} defaultValue={item?.sku ?? ""} />
        </label>
        <label>
          Fiyat (TL)
          <input
            name="price"
            inputMode="decimal"
            required
            defaultValue={(price?.amountMinor ?? 0) / 100}
          />
        </label>
        <label>
          KDV (%)
          <input
            name="vat"
            inputMode="decimal"
            required
            defaultValue={(price?.vatBasisPoints ?? 0) / 100}
          />
        </label>
        <label className="check-label">
          <input type="checkbox" name="active" defaultChecked={item?.active ?? true} />
          Etkin
        </label>
        <label className="check-label">
          <input type="checkbox" name="available" defaultChecked={item?.available ?? true} />
          Satışa açık
        </label>
        <div className="form-actions full">
          <button className="primary">Ürünü kaydet</button>
        </div>
      </form>
    </>
  );
}
function CategoryForm({
  category,
  mutate,
  onSaved,
}: {
  category?: Category;
  mutate: Mutation;
  onSaved: (id: string) => void;
}) {
  return (
    <>
      <div className="section-heading">
        <h2>{category === undefined ? "Yeni kategori" : "Kategoriyi düzenle"}</h2>
      </div>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void mutate(async () => {
            const body = catalogCategoryBodySchema.parse({
              name: formText(data, "name"),
              sortOrder: Number(formText(data, "sortOrder")),
              active: data.has("active"),
            });
            const result = await call(
              catalogCategorySchema,
              category === undefined
                ? "/api/business/catalog/categories"
                : `/api/business/catalog/categories/${category.id}`,
              category === undefined ? "POST" : "PUT",
              body,
            );
            onSaved(result.id);
          });
        }}
      >
        <label>
          Kategori adı
          <input name="name" maxLength={80} required defaultValue={category?.name} />
        </label>
        <label>
          Görünme sırası
          <input
            name="sortOrder"
            type="number"
            min={0}
            max={100000}
            defaultValue={category?.sortOrder ?? 0}
            required
          />
        </label>
        <label className="check-label">
          <input type="checkbox" name="active" defaultChecked={category?.active ?? true} />
          Etkin
        </label>
        <button className="primary">Kategoriyi kaydet</button>
      </form>
    </>
  );
}
function GroupForm({
  group,
  mutate,
  onSaved,
}: {
  group?: Group;
  mutate: Mutation;
  onSaved: (id: string) => void;
}) {
  const [rows, setRows] = useState(
    (group?.options ?? [{ name: "", priceDeltaMinor: 0, active: true, sortOrder: 0 }]).map(
      (option, i) => ({
        ...option,
        key: `initial-${i}`,
        id: "id" in option ? option.id : undefined,
      }),
    ),
  );
  return (
    <>
      <div className="section-heading">
        <h2>{group === undefined ? "Yeni seçenek grubu" : "Grubu düzenle"}</h2>
      </div>
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void mutate(async () => {
            const body = catalogOptionGroupBodySchema.parse({
              name: formText(data, "name"),
              minSelected: Number(formText(data, "min")),
              maxSelected: Number(formText(data, "max")),
              active: data.has("active"),
              options: rows.map((row, i) => ({
                ...(row.id === undefined ? {} : { id: row.id }),
                name: formText(data, `option-name-${i}`),
                priceDeltaMinor: decimalToMinor(formText(data, `option-price-${i}`)),
                active: data.has(`option-active-${i}`),
                sortOrder: i,
              })),
            });
            const result = await call(
              catalogOptionGroupSchema,
              group === undefined
                ? "/api/business/catalog/option-groups"
                : `/api/business/catalog/option-groups/${group.id}`,
              group === undefined ? "POST" : "PUT",
              body,
            );
            setRows(result.options.map((option) => ({ ...option, key: option.id })));
            onSaved(result.id);
          });
        }}
      >
        <label>
          Grup adı
          <input name="name" maxLength={80} required defaultValue={group?.name} />
        </label>
        <div className="form-grid">
          <label>
            En az seçim
            <input
              type="number"
              name="min"
              min={0}
              max={20}
              required
              defaultValue={group?.minSelected ?? 0}
            />
          </label>
          <label>
            En çok seçim
            <input
              type="number"
              name="max"
              min={0}
              max={20}
              required
              defaultValue={group?.maxSelected ?? 1}
            />
          </label>
        </div>
        <label className="check-label">
          <input type="checkbox" name="active" defaultChecked={group?.active ?? true} />
          Grup etkin
        </label>
        <div>
          {rows.map((row, i) => (
            <div className="option-row" key={row.key}>
              <label>
                Seçenek adı
                <input name={`option-name-${i}`} defaultValue={row.name} maxLength={80} required />
              </label>
              <label>
                Ek tutar (TL)
                <input
                  name={`option-price-${i}`}
                  defaultValue={row.priceDeltaMinor / 100}
                  inputMode="decimal"
                  required
                />
              </label>
              <button
                type="button"
                className="secondary danger"
                aria-label="Seçeneği kaldır"
                onClick={() => {
                  setRows(rows.filter((r) => r.key !== row.key));
                }}
              >
                ×
              </button>
              <label className="check-label">
                <input type="checkbox" name={`option-active-${i}`} defaultChecked={row.active} />
                Etkin
              </label>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="secondary"
          disabled={rows.length >= 100}
          onClick={() => {
            setRows([
              ...rows,
              {
                key: crypto.randomUUID(),
                id: undefined,
                name: "",
                priceDeltaMinor: 0,
                active: true,
                sortOrder: rows.length,
              },
            ]);
          }}
        >
          Seçenek ekle
        </button>
        <button className="primary">Grubu kaydet</button>
      </form>
    </>
  );
}
function PriceForm({
  item,
  catalog,
  branches,
  mutate,
}: {
  item: Item;
  catalog: Catalog;
  branches: Branch[];
  mutate: Mutation;
}) {
  const [branchId, setBranchId] = useState("");
  const price = catalog.prices.find(
    (p) => p.itemId === item.id && p.branchId === (branchId || null),
  );
  return (
    <div className="subpanel">
      <h3>Genel veya şubeye özel fiyat</h3>
      <label>
        Fiyatın uygulandığı yer
        <select
          value={branchId}
          onChange={(e) => {
            setBranchId(e.target.value);
          }}
        >
          <option value="">Bütün şubeler</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <form
        key={`${branchId}:${price?.amountMinor ?? 0}:${price?.vatBasisPoints ?? 0}`}
        className="form-stack price-form"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          void mutate(async () => {
            const body = catalogPriceBodySchema.parse({
              branchId: branchId || null,
              amountMinor: decimalToMinor(formText(data, "price")),
              vatBasisPoints: decimalToMinor(formText(data, "vat")),
            });
            await call(z.null(), `/api/business/catalog/items/${item.id}/prices`, "PUT", body);
          });
        }}
      >
        <div className="form-grid">
          <label>
            Fiyat (TL)
            <input
              name="price"
              inputMode="decimal"
              defaultValue={(price?.amountMinor ?? 0) / 100}
              required
            />
          </label>
          <label>
            KDV (%)
            <input
              name="vat"
              inputMode="decimal"
              defaultValue={(price?.vatBasisPoints ?? 0) / 100}
              required
            />
          </label>
        </div>
        <button className="secondary">Fiyatı kaydet</button>
      </form>
    </div>
  );
}
