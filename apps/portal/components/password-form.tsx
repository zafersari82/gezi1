"use client";

import { ADMIN_PASSWORD_MIN_LENGTH } from "@vado/contracts";
import { useActionState } from "react";

import { changePassword } from "@/lib/actions";
import type { FormState } from "@/lib/form-state";

import { FormFeedback } from "./form-feedback";
import { SubmitButton } from "./submit-button";

const INITIAL_STATE: FormState<null> = { error: null, saved: false, values: null };

/** Parola değişikliği; hesabın diğer tarayıcılardaki oturumları kapanır. */
export function PasswordForm() {
  const [state, formAction] = useActionState(changePassword, INITIAL_STATE);

  return (
    <form action={formAction} className="panel form">
      <div className="field">
        <label htmlFor="currentPassword">Mevcut parola</label>
        <input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <div className="form-row">
        <div className="field">
          <label htmlFor="newPassword">Yeni parola</label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={ADMIN_PASSWORD_MIN_LENGTH}
            required
            aria-describedby="new-password-hint"
          />
          <p className="hint" id="new-password-hint">
            En az {ADMIN_PASSWORD_MIN_LENGTH} karakter. Uzun bir cümle ya da parola yöneticisinin
            ürettiği bir değer kullan.
          </p>
        </div>
        <div className="field">
          <label htmlFor="repeatPassword">Yeni parola (tekrar)</label>
          <input
            id="repeatPassword"
            name="repeatPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>
      </div>
      <div className="form-footer">
        <SubmitButton variant="primary">Parolayı değiştir</SubmitButton>
        <FormFeedback state={state} saved="Parolan değişti. Diğer oturumların kapatıldı." />
      </div>
    </form>
  );
}
