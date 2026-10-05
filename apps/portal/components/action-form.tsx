"use client";

import { useActionState } from "react";

import type { FormState } from "@/lib/form-state";

import { FormFeedback } from "./form-feedback";
import { SubmitButton } from "./submit-button";

interface ActionFormProps {
  /** Alanı olmayan, tek düğmeyle çalışan sunucu işlevi. */
  action: () => Promise<FormState<unknown>>;
  label: string;
  variant?: "default" | "primary" | "danger";
  /** Doluysa gönderimden önce bu soruyla onay istenir. */
  confirm?: string;
  /** İşlem tamamlandığında gösterilen ileti. */
  saved: string;
}

const INITIAL_STATE: FormState<unknown> = { error: null, saved: false, values: null };

/** Tek düğmeli işlem: API reddederse nedeni düğmenin yanında gösterilir. */
export function ActionForm({ action, label, variant, confirm, saved }: ActionFormProps) {
  const [state, formAction] = useActionState(() => action(), INITIAL_STATE);

  return (
    <form action={formAction} className="action-form">
      <SubmitButton
        {...(variant === undefined ? {} : { variant })}
        {...(confirm === undefined ? {} : { confirm })}
      >
        {label}
      </SubmitButton>
      <FormFeedback state={state} saved={saved} />
    </form>
  );
}
