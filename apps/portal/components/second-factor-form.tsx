"use client";

import { useActionState, useState } from "react";

import { verifySecondFactor } from "@/lib/actions";
import type { FormState } from "@/lib/form-state";

import { FormFeedback } from "./form-feedback";
import { SubmitButton } from "./submit-button";

const INITIAL_STATE: FormState<null> = { error: null, saved: false, values: null };

/** İkinci adım: doğrulama uygulamasındaki kod; telefon yanında değilse kurtarma kodu. */
export function SecondFactorForm() {
  const [state, formAction] = useActionState(verifySecondFactor, INITIAL_STATE);
  const [useRecovery, setUseRecovery] = useState(false);

  return (
    <form action={formAction} className="form">
      {useRecovery ? (
        <div className="field">
          <label htmlFor="recoveryCode">Kurtarma kodu</label>
          <input
            id="recoveryCode"
            name="recoveryCode"
            type="text"
            className="mono"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            required
            autoFocus
            aria-describedby="recovery-hint"
          />
          <p className="hint" id="recovery-hint">
            İkinci adımı kurarken kaydettiğin kodlardan biri. Her kod bir kez kullanılabilir.
          </p>
        </div>
      ) : (
        <div className="field">
          <label htmlFor="code">Doğrulama kodu</label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            className="mono code-input"
            required
            autoFocus
            aria-describedby="code-hint"
          />
          <p className="hint" id="code-hint">
            Doğrulama uygulamasında VADO Control için gösterilen 6 haneli kod.
          </p>
        </div>
      )}
      <div className="form-footer">
        <SubmitButton variant="primary">Giriş yap</SubmitButton>
        <button
          type="button"
          className="button-link"
          onClick={() => {
            setUseRecovery(!useRecovery);
          }}
        >
          {useRecovery ? "Uygulamadaki kodu kullan" : "Telefonum yanımda değil"}
        </button>
        <FormFeedback state={state} saved="" />
      </div>
    </form>
  );
}
