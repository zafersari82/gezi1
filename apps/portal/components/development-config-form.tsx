"use client";

import { useActionState } from "react";

import { saveDevelopmentConfig } from "@/lib/actions";
import { formKey, type FormState, shownValues } from "@/lib/form-state";

import { FormFeedback } from "./form-feedback";
import { SubmitButton } from "./submit-button";

interface DevelopmentConfigFormProps {
  miniAppId: string;
  /** Kayıtlı ayarlar, girintili JSON olarak. */
  json: string;
}

/**
 * Geliştirme kaydının ayarları. Bu kayıtların paketi olmadığı için alan tanımı da yoktur;
 * geliştirici, paketinin okuyacağı değerleri JSON olarak yazar.
 */
export function DevelopmentConfigForm({ miniAppId, json }: DevelopmentConfigFormProps) {
  const initialState: FormState<{ json: string }> = { error: null, saved: false, values: { json } };
  const [state, formAction] = useActionState(
    saveDevelopmentConfig.bind(null, miniAppId),
    initialState,
  );

  const values = shownValues(state, { json });

  return (
    <form key={formKey(values)} action={formAction} className="form">
      <div className="field">
        <label htmlFor="json">Ayarlar (JSON)</label>
        <textarea
          id="json"
          name="json"
          className="mono"
          rows={6}
          defaultValue={values.json}
          aria-describedby="json-hint"
        />
        <p className="hint" id="json-hint">
          Mini uygulama bu değerleri vado.app.getContext() ile okur. Değerler metin, sayı ya da
          true/false olabilir.
        </p>
      </div>
      <div className="form-footer">
        <SubmitButton variant="primary">Ayarları kaydet</SubmitButton>
        <FormFeedback state={state} saved="Kaydedildi." />
      </div>
    </form>
  );
}
