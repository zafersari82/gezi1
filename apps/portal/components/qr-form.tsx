"use client";

import { useActionState } from "react";

import { issueMiniAppQr } from "@/lib/actions";
import { EMPTY_QR, type QrFormState } from "@/lib/form-state";

import { FormFeedback } from "./form-feedback";
import { SubmitButton } from "./submit-button";

const INITIAL_STATE: QrFormState = { error: null, saved: false, values: EMPTY_QR, qr: null };

/**
 * Mini uygulamanın QR kodunu üretir. Parametreler (masa, şube) kodun imzasının içindedir; mini
 * uygulama onları `app.getContext().params` ile okur.
 */
export function QrForm({ miniAppId }: { miniAppId: string }) {
  const [state, formAction] = useActionState(issueMiniAppQr.bind(null, miniAppId), INITIAL_STATE);
  const { qr } = state;
  const entries = qr === null ? [] : Object.entries(qr.params);

  return (
    <div className="qr-issue">
      <form action={formAction} className="inline-form">
        <div className="field">
          <label htmlFor="qr-params">Parametreler (isteğe bağlı, her satıra bir ad=değer)</label>
          <textarea
            id="qr-params"
            name="params"
            rows={3}
            className="mono"
            defaultValue={state.values.params}
            placeholder={"masa=12\nsube=kadikoy"}
          />
          <p className="hint">
            En fazla 5 parametre. Ad küçük harf, rakam ve _ olur (en fazla 20 karakter); değer en
            fazla 64 karakter. Kod süresizdir; parametreleri değiştirmek için yeni kod üret.
          </p>
        </div>
        <SubmitButton>Kodu üret</SubmitButton>
        <FormFeedback state={state} saved="Kod üretildi." />
      </form>
      {qr !== null && (
        <figure className="qr-result">
          <img src={qr.dataUrl} alt="Mini uygulamanın QR kodu" width={220} height={220} />
          <figcaption>
            {entries.length === 0
              ? "Parametresiz kod"
              : entries.map(([key, value]) => `${key}=${value}`).join(", ")}
            <a href={qr.dataUrl} download={`vado-${miniAppId}.svg`} className="button">
              SVG olarak indir
            </a>
          </figcaption>
        </figure>
      )}
    </div>
  );
}
