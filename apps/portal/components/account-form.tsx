"use client";

import { ADMIN_ROLE_DESCRIPTIONS, ADMIN_ROLE_LABELS, ADMIN_ROLES } from "@vado/contracts";
import { useActionState } from "react";

import { createAccount } from "@/lib/actions";
import { type AccountFormValues, EMPTY_ACCOUNT, formKey, type FormState } from "@/lib/form-state";

import { FormFeedback } from "./form-feedback";
import { SecretList } from "./secret-list";
import { SubmitButton } from "./submit-button";

const INITIAL_STATE: FormState<AccountFormValues> = {
  error: null,
  saved: false,
  values: EMPTY_ACCOUNT,
};

/** Yeni panel hesabı. Geçici parola bir kez gösterilir; hesap ilk girişte kendi parolasını seçer. */
export function AccountForm() {
  const [state, formAction] = useActionState(createAccount, INITIAL_STATE);
  const values = state.saved ? EMPTY_ACCOUNT : state.values;
  const { temporaryPassword } = state.values;

  return (
    <form key={formKey(values)} action={formAction} className="panel form">
      {state.saved && temporaryPassword !== null && (
        <SecretList
          title={`${state.values.displayName} için geçici parola`}
          hint="Parola bir daha gösterilmez. Kişiye güvenli bir yoldan ilet; ilk girişte kendi parolasını seçer ve iki adımlı doğrulamayı kurar."
          secrets={[temporaryPassword]}
        />
      )}
      <div className="form-row">
        <div className="field">
          <label htmlFor="displayName">Ad soyad</label>
          <input
            id="displayName"
            name="displayName"
            type="text"
            defaultValue={values.displayName}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="username">Kullanıcı adı</label>
          <input
            id="username"
            name="username"
            type="text"
            className="mono"
            autoCapitalize="none"
            spellCheck={false}
            defaultValue={values.username}
            required
            aria-describedby="username-hint"
          />
          <p className="hint" id="username-hint">
            Küçük harf, rakam, nokta ve tire; sonradan değiştirilemez.
          </p>
        </div>
      </div>
      <fieldset className="field">
        <legend>Rol</legend>
        <div className="checks">
          {ADMIN_ROLES.map((role) => (
            <label key={role}>
              <input type="radio" name="role" value={role} defaultChecked={values.role === role} />
              <span>
                {ADMIN_ROLE_LABELS[role]}
                <small>{ADMIN_ROLE_DESCRIPTIONS[role]}</small>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="form-footer">
        <SubmitButton variant="primary">Hesabı aç</SubmitButton>
        <FormFeedback state={state} saved="Hesap açıldı." />
      </div>
    </form>
  );
}
