"use client";

import type { ConfigField } from "@vado/contracts";
import { useActionState } from "react";

import { configFieldName } from "@/lib/config-values";
import { type ConfigFormValues, formKey, type FormState, shownValues } from "@/lib/form-state";

import { FormFeedback } from "./form-feedback";
import { SubmitButton } from "./submit-button";

interface ConfigFormProps {
  /** Ayarları kaydeden ya da sürümü bu ayarlarla yayınlayan sunucu işlevi. */
  action: (
    previous: FormState<ConfigFormValues>,
    formData: FormData,
  ) => Promise<FormState<ConfigFormValues>>;
  /** Paketin bildirim dosyasında tanımladığı ayar alanları. */
  fields: ConfigField[];
  /** Kayıtlı ayarlar, formda gösterilecek biçimde. */
  current: ConfigFormValues;
  submitLabel: string;
  saved: string;
}

function FieldInput({ field, value }: { field: ConfigField; value: string }) {
  const name = configFieldName(field.key);
  const describedBy = field.help === undefined ? undefined : `${name}-hint`;

  if (field.type === "boolean") {
    return (
      <div className="checks">
        <label>
          <input type="checkbox" name={name} defaultChecked={value === "on"} />
          <span>
            {field.label}
            {field.help !== undefined && <small>{field.help}</small>}
          </span>
        </label>
      </div>
    );
  }
  return (
    <div className="field">
      <label htmlFor={name}>
        {field.label}
        {!field.required && <span className="optional"> (isteğe bağlı)</span>}
      </label>
      {field.type === "select" ? (
        <select
          id={name}
          name={name}
          defaultValue={value}
          required={field.required}
          aria-describedby={describedBy}
        >
          {!field.required && <option value="">Seçilmedi</option>}
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={name}
          name={name}
          type="text"
          inputMode={field.type === "number" ? "decimal" : "text"}
          defaultValue={value}
          required={field.required}
          maxLength={field.maxLength}
          aria-describedby={describedBy}
        />
      )}
      {field.help !== undefined && (
        <p className="hint" id={describedBy}>
          {field.help}
        </p>
      )}
    </div>
  );
}

/**
 * İşletmeye özel ayarlar. Form, paketin bildirim dosyasındaki alan tanımlarından üretilir; aynı
 * paketi kullanan her uygulama kaydı bu alanları kendi değerleriyle doldurur.
 */
export function ConfigForm({ action, fields, current, submitLabel, saved }: ConfigFormProps) {
  const initialState: FormState<ConfigFormValues> = { error: null, saved: false, values: current };
  const [state, formAction] = useActionState(action, initialState);
  const values = shownValues(state, current);

  return (
    <form key={formKey(values)} action={formAction} className="form">
      {fields.length === 0 && (
        <p className="muted">Bu sürümün işletmeden beklediği bir ayar yok.</p>
      )}
      {fields.map((field) => (
        <FieldInput key={field.key} field={field} value={values[field.key] ?? ""} />
      ))}
      <div className="form-footer">
        <SubmitButton variant="primary">{submitLabel}</SubmitButton>
        <FormFeedback state={state} saved={saved} />
      </div>
    </form>
  );
}
