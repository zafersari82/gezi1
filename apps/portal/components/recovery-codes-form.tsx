"use client";

import { useActionState } from "react";

import { regenerateRecoveryCodes } from "@/lib/actions";
import { type FormState, NO_SECRET, type RevealedSecret } from "@/lib/form-state";

import { FormFeedback } from "./form-feedback";
import { SecretList } from "./secret-list";
import { SubmitButton } from "./submit-button";

const INITIAL_STATE: FormState<RevealedSecret> = { error: null, saved: false, values: NO_SECRET };

/** Kurtarma kodlarını yeniler; eski kodlar geçersiz olur, yenileri bir kez gösterilir. */
export function RecoveryCodesForm() {
  const [state, formAction] = useActionState(regenerateRecoveryCodes, INITIAL_STATE);

  return (
    <form action={formAction} className="panel form">
      {state.saved ? (
        <SecretList
          title="Yeni kurtarma kodların"
          hint="Eski kodlar artık geçmez. Bu kodlar bir daha gösterilmez: şimdi güvenli bir yere kaydet."
          secrets={state.values.secrets}
        />
      ) : (
        <div className="field">
          <label htmlFor="recovery-code">Uygulamadaki kod</label>
          <input
            id="recovery-code"
            name="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            maxLength={7}
            className="mono code-input"
            required
            aria-describedby="recovery-code-hint"
          />
          <p className="hint" id="recovery-code-hint">
            Kodlarını kaybettiysen ya da çoğunu kullandıysan yenile. Eski kodların hepsi geçersiz
            olur.
          </p>
        </div>
      )}
      {!state.saved && (
        <div className="form-footer">
          <SubmitButton>Kurtarma kodlarını yenile</SubmitButton>
          <FormFeedback state={state} saved="" />
        </div>
      )}
    </form>
  );
}
