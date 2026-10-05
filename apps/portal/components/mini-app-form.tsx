"use client";

import { CAPABILITIES, CAPABILITY_LABELS, CATEGORIES, CATEGORY_LABELS } from "@vado/contracts";
import { useActionState } from "react";

import { saveMiniApp } from "@/lib/actions";
import { formKey, type FormState, type MiniAppFormValues, shownValues } from "@/lib/form-state";

import { FormFeedback } from "./form-feedback";
import { SubmitButton } from "./submit-button";

interface MiniAppFormProps {
  mode: "create" | "edit";
  /**
   * `showcase`: işletmenin vitrini; kodu, yayınlanan paket sürümünden gelir.
   * `development`: geliştiricinin kendi sunucusundan açılan kayıt; yalnızca geliştirme ortamında.
   */
  kind: "showcase" | "development";
  initial: MiniAppFormValues;
}

/** Uygulama kaydını oluşturma ve düzenleme formu. */
export function MiniAppForm({ mode, kind, initial }: MiniAppFormProps) {
  const initialState: FormState<MiniAppFormValues> = { error: null, saved: false, values: initial };
  const [state, formAction] = useActionState(saveMiniApp.bind(null, mode, kind), initialState);
  const values = shownValues(state, initial);

  return (
    <form key={formKey(values)} action={formAction} className="panel form">
      <div className="form-row">
        <div className="field">
          <label htmlFor="id">Kimlik</label>
          <input
            id="id"
            name="id"
            type="text"
            className="mono"
            defaultValue={values.id}
            readOnly={mode === "edit"}
            required
            aria-describedby="id-hint"
          />
          <p className="hint" id="id-hint">
            {mode === "edit"
              ? "Kimlik sonradan değiştirilemez."
              : "Küçük harf, rakam ve tire; örneğin kadikoy-berber. Sonradan değiştirilemez."}
          </p>
        </div>
        <div className="field">
          <label htmlFor="name">Ad</label>
          <input id="name" name="name" type="text" defaultValue={values.name} required />
        </div>
      </div>

      <div className="field">
        <label htmlFor="description">Açıklama</label>
        <textarea
          id="description"
          name="description"
          defaultValue={values.description}
          required
          aria-describedby="description-hint"
        />
        <p className="hint" id="description-hint">
          Kullanıcıların listede gördüğü tanıtım; 10 ile 300 karakter arası.
        </p>
      </div>

      <div className="form-row">
        <div className="field">
          <label htmlFor="category">Kategori</label>
          <select id="category" name="category" defaultValue={values.category}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="developerName">Geliştirici</label>
          <input
            id="developerName"
            name="developerName"
            type="text"
            defaultValue={values.developerName}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="sortOrder">Sıra</label>
          <input
            id="sortOrder"
            name="sortOrder"
            type="number"
            min={0}
            max={10000}
            defaultValue={values.sortOrder}
            aria-describedby="sort-hint"
          />
          <p className="hint" id="sort-hint">
            Küçük sayı listede önce görünür.
          </p>
        </div>
      </div>

      <div className="field">
        <label htmlFor="iconUrl">Simge adresi (isteğe bağlı)</label>
        <input
          id="iconUrl"
          name="iconUrl"
          type="url"
          defaultValue={values.iconUrl}
          aria-describedby="icon-hint"
        />
        <p className="hint" id="icon-hint">
          {kind === "showcase"
            ? "Boş bırakılırsa yayındaki paketin simgesi kullanılır."
            : "Boş bırakılırsa adın baş harfi gösterilir."}
        </p>
      </div>

      {kind === "development" && (
        <>
          <div className="field">
            <label htmlFor="entryUrl">Giriş adresi</label>
            <input
              id="entryUrl"
              name="entryUrl"
              type="url"
              defaultValue={values.entryUrl}
              placeholder="http://localhost:5173"
              required
              aria-describedby="entry-hint"
            />
            <p className="hint" id="entry-hint">
              Geliştirme sunucusunun adresi. Bu adres değişirse kaydın doğrulaması sıfırlanır.
            </p>
          </div>

          <div className="field">
            <label htmlFor="allowedOrigins">İzinli kaynaklar</label>
            <textarea
              id="allowedOrigins"
              name="allowedOrigins"
              className="mono"
              defaultValue={values.allowedOrigins}
              placeholder="http://localhost:5173"
              required
              aria-describedby="origins-hint"
            />
            <p className="hint" id="origins-hint">
              Her satıra bir kaynak. Mini uygulama yalnızca bu kaynaklardaki sayfaları açabilir;
              giriş adresinin kaynağı listede olmalı.
            </p>
          </div>

          <fieldset className="field">
            <legend>Yetkiler</legend>
            <div className="checks">
              {CAPABILITIES.map((capability) => (
                <label key={capability}>
                  <input
                    type="checkbox"
                    name="capabilities"
                    value={capability}
                    defaultChecked={values.capabilities.includes(capability)}
                  />
                  <span>
                    {CAPABILITY_LABELS[capability]}
                    <small className="mono">{capability}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="field">
            <label htmlFor="version">Sürüm</label>
            <input
              id="version"
              name="version"
              type="text"
              className="mono"
              defaultValue={values.version}
              placeholder="0.0.1"
              required
            />
          </div>
        </>
      )}

      <div className="form-footer">
        <SubmitButton variant="primary">
          {mode === "create" ? "Kaydı oluştur" : "Değişiklikleri kaydet"}
        </SubmitButton>
        <FormFeedback state={state} saved="Kaydedildi." />
      </div>
    </form>
  );
}
