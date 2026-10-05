"use client";

import { ADMIN_ROLE_LABELS, ADMIN_ROLES, type AdminRole, isScopedRole } from "@vado/contracts";
import { useActionState } from "react";

import { changeRole } from "@/lib/actions";
import type { FormState } from "@/lib/form-state";

import { FormFeedback } from "./form-feedback";
import { SubmitButton } from "./submit-button";

const INITIAL_STATE: FormState<unknown> = { error: null, saved: false, values: null };

/**
 * Hesabın rolünü değiştirir; hesabın açık oturumları kapanır. İşletme rolü burada seçilemez:
 * işletme hesabı açılırken işletmesiyle birlikte belirlenir ve sonradan değişmez.
 */
export function RoleForm({ accountId, role }: { accountId: string; role: AdminRole }) {
  const [state, formAction] = useActionState(changeRole.bind(null, accountId), INITIAL_STATE);

  return (
    <form action={formAction} className="action-form role-form">
      <label className="visually-hidden" htmlFor={`role-${accountId}`}>
        Rol
      </label>
      <select id={`role-${accountId}`} name="role" defaultValue={role}>
        {ADMIN_ROLES.filter((option) => !isScopedRole(option)).map((option) => (
          <option key={option} value={option}>
            {ADMIN_ROLE_LABELS[option]}
          </option>
        ))}
      </select>
      <SubmitButton confirm="Rol değişsin mi? Hesabın açık oturumları kapanır.">
        Değiştir
      </SubmitButton>
      <FormFeedback state={state} saved="Rol değişti." />
    </form>
  );
}
