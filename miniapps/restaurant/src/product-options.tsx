import type { Catalog, CatalogSelection } from "@vado/contracts";
import { useState } from "react";

import { money, selectionProblem } from "./model";

export function ProductOptions({
  item,
  catalog,
  onAdd,
  onClose,
  busy,
}: {
  item: Catalog["items"][number];
  catalog: Catalog;
  onAdd: (line: CatalogSelection) => Promise<void>;
  onClose: () => void;
  busy: boolean;
}) {
  const groups = catalog.optionGroups.filter((g) => item.optionGroupIds.includes(g.id) && g.active);
  const [selected, setSelected] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const problem = selectionProblem(groups, selected);
  const price = catalog.prices.find((p) => p.itemId === item.id)?.amountMinor;
  return (
    <div className="modal-backdrop">
      <section className="product-dialog" role="dialog" aria-modal="true" aria-label={item.name}>
        <button className="close" onClick={onClose} disabled={busy} aria-label="Ürünü kapat">
          ×
        </button>
        <span className="eyebrow">Sana göre hazırlayalım</span>
        <h2>{item.name}</h2>
        <p>{item.description}</p>
        {groups.map((g) => (
          <fieldset key={g.id}>
            <legend>
              {g.name} · {g.minSelected > 0 ? "Zorunlu" : "İsteğe bağlı"}
            </legend>
            <small>
              En az {g.minSelected}, en çok {g.maxSelected}
            </small>
            {g.options
              .filter((o) => o.active)
              .map((o) => (
                <label className="option" key={o.id}>
                  <input
                    type={g.maxSelected === 1 ? "radio" : "checkbox"}
                    name={g.id}
                    checked={selected.includes(o.id)}
                    onChange={() => {
                      setSelected((current) =>
                        current.includes(o.id)
                          ? current.filter((id) => id !== o.id)
                          : [
                              ...current.filter(
                                (id) => g.maxSelected !== 1 || !g.options.some((p) => p.id === id),
                              ),
                              o.id,
                            ],
                      );
                    }}
                  />
                  <span>{o.name}</span>
                  <span>{o.priceDeltaMinor > 0 ? `+${money(o.priceDeltaMinor)}` : ""}</span>
                </label>
              ))}
          </fieldset>
        ))}
        <label>
          Adet
          <input
            type="number"
            min="1"
            max="99"
            value={quantity}
            onChange={(e) => {
              setQuantity(Number(e.target.value));
            }}
          />
        </label>
        <label>
          Sipariş notu
          <textarea
            maxLength={500}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
            }}
            placeholder="Örneğin: soğansız"
          />
        </label>
        {problem && (
          <p className="muted" role="status">
            {problem}
          </p>
        )}
        <button
          disabled={
            busy ||
            problem !== null ||
            !Number.isInteger(quantity) ||
            quantity < 1 ||
            quantity > 99 ||
            price === undefined
          }
          onClick={() => void onAdd({ itemId: item.id, quantity, optionIds: selected, note })}
        >
          Sepete ekle{" "}
          {price === undefined
            ? ""
            : money(
                quantity *
                  (price +
                    groups
                      .flatMap((g) => g.options)
                      .filter((o) => selected.includes(o.id))
                      .reduce((s, o) => s + o.priceDeltaMinor, 0)),
              )}
        </button>
      </section>
    </div>
  );
}
