"use client";

import { useActionState } from "react";

import { savePackage } from "@/lib/actions";
import { formKey, type FormState, type PackageFormValues, shownValues } from "@/lib/form-state";

import { FormFeedback } from "./form-feedback";
import { SubmitButton } from "./submit-button";

interface PackageFormProps {
  mode: "create" | "edit";
  initial: PackageFormValues;
}

/** Paketin kimlik kaydı: sürümler bu kaydın altına yüklenir. */
export function PackageForm({ mode, initial }: PackageFormProps) {
  const initialState: FormState<PackageFormValues> = { error: null, saved: false, values: initial };
  const [state, formAction] = useActionState(savePackage.bind(null, mode), initialState);
  const values = shownValues(state, initial);

  return (
    <form key={formKey(values)} action={formAction} className="panel form">
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
            : "Paketin bildirim dosyasındaki (vado.app.json) kimlikle aynı olmalı; sonradan değiştirilemez."}
        </p>
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="name">Ad</label>
          <input id="name" name="name" type="text" defaultValue={values.name} required />
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
      </div>
      <div className="form-footer">
        <SubmitButton variant="primary">
          {mode === "create" ? "Paketi oluştur" : "Değişiklikleri kaydet"}
        </SubmitButton>
        <FormFeedback state={state} saved="Kaydedildi." />
      </div>
    </form>
  );
}
