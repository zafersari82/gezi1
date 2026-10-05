"use client";

import { useActionState } from "react";

import { login } from "@/lib/actions";
import type { FormState, LoginFormValues } from "@/lib/form-state";

import { FormFeedback } from "./form-feedback";
import { SubmitButton } from "./submit-button";

const INITIAL_STATE: FormState<LoginFormValues> = {
  error: null,
  saved: false,
  values: { username: "" },
};

/** Kullanıcı adı ve parola. Geçerse ikinci adıma geçilir. */
export function LoginForm() {
  const [state, formAction] = useActionState(login, INITIAL_STATE);

  return (
    <form action={formAction} className="form">
      <div className="field">
        <label htmlFor="username">Kullanıcı adı</label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={state.values.username}
          required
          autoFocus
        />
      </div>
      <div className="field">
        <label htmlFor="password">Parola</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <div className="form-footer">
        <SubmitButton variant="primary">Devam et</SubmitButton>
        <FormFeedback state={state} saved="" />
      </div>
    </form>
  );
}
