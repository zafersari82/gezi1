"use client";

import { useActionState } from "react";

import { resetAccountPassword } from "@/lib/actions";
import { type FormState, NO_SECRET, type RevealedSecret } from "@/lib/form-state";

import { FormFeedback } from "./form-feedback";
import { SecretList } from "./secret-list";
import { SubmitButton } from "./submit-button";

const INITIAL_STATE: FormState<RevealedSecret> = { error: null, saved: false, values: NO_SECRET };

/** Parolayı sıfırlar; geçici parola bir kez gösterilir, hesabın oturumları kapanır. */
export function ResetPasswordForm({ accountId, name }: { accountId: string; name: string }) {
  const [state, formAction] = useActionState(
    resetAccountPassword.bind(null, accountId),
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="action-form">
      {state.saved ? (
        <SecretList
          title="Geçici parola"
          hint="Bir daha gösterilmez; kişiye güvenli bir yoldan ilet."
          secrets={state.values.secrets}
        />
      ) : (
        <SubmitButton
          confirm={`${name} için parola sıfırlansın mı? Açık oturumları kapanır ve kilidi açılır.`}
        >
          Parolayı sıfırla
        </SubmitButton>
      )}
      <FormFeedback state={state} saved="" />
    </form>
  );
}
