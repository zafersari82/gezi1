"use client";

import type { MouseEvent } from "react";
import { useFormStatus } from "react-dom";

interface SubmitButtonProps {
  children: string;
  variant?: "default" | "primary" | "danger";
  /** Doluysa gönderimden önce bu soruyla onay istenir. */
  confirm?: string;
}

const VARIANT_CLASS = {
  default: "button",
  primary: "button button-primary",
  danger: "button button-danger",
} as const;

/** İçinde bulunduğu formu gönderen düğme; gönderim sürerken kilitlenir. */
export function SubmitButton({ children, variant = "default", confirm }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  function askFirst(event: MouseEvent<HTMLButtonElement>) {
    if (confirm !== undefined && !window.confirm(confirm)) event.preventDefault();
  }

  return (
    <button type="submit" className={VARIANT_CLASS[variant]} disabled={pending} onClick={askFirst}>
      {children}
    </button>
  );
}
