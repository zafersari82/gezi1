"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { confirmTotpSetup, startTotpSetup } from "@/lib/actions";
import {
  type FormState,
  NO_SECRET,
  type RevealedSecret,
  type TotpSetupView,
} from "@/lib/form-state";

import { FormFeedback } from "./form-feedback";
import { SecretList } from "./secret-list";
import { SubmitButton } from "./submit-button";

const INITIAL_STATE: FormState<RevealedSecret> = { error: null, saved: false, values: NO_SECRET };

/** Sırrı dörder karakterlik gruplar hâlinde gösterir; elle yazarken okumak kolaylaşır. */
function grouped(secret: string): string {
  return secret.match(/.{1,4}/g)?.join(" ") ?? secret;
}

/**
 * İkinci adımın kurulumu: sır üretilir ve QR koduyla gösterilir, uygulamadaki ilk kodla doğrulanır.
 * Doğrulanınca oturum açılır ve kurtarma kodları bir kez gösterilir.
 */
export function TotpSetupForm() {
  const [setup, setSetup] = useState<TotpSetupView | null>(null);
  const [state, formAction] = useActionState(confirmTotpSetup, INITIAL_STATE);

  if (state.saved) {
    return (
      <div className="form">
        <SecretList
          title="Kurtarma kodların"
          hint="Telefonuna ulaşamazsan bu kodlarla girersin; her biri bir kez geçer. Kodlar bir daha gösterilmez: şimdi güvenli bir yere (parola yöneticisine) kaydet."
          secrets={state.values.secrets}
        />
        <div className="form-footer">
          <Link href="/" className="button button-primary">
            Kodları kaydettim, devam et
          </Link>
        </div>
      </div>
    );
  }

  if (setup === null) {
    return (
      <form
        className="form"
        action={async () => {
          setSetup(await startTotpSetup());
        }}
      >
        <div className="form-footer">
          <SubmitButton variant="primary">Kurulumu başlat</SubmitButton>
        </div>
      </form>
    );
  }

  return (
    <form action={formAction} className="form">
      <ol className="steps">
        <li>
          Uygulamada yeni hesap ekle ve bu kodu okut:
          <img
            className="totp-qr"
            src={setup.qrDataUrl}
            alt="Doğrulama uygulamasına okutulacak QR kodu"
            width={180}
            height={180}
          />
          Okutamıyorsan anahtarı elle yaz:{" "}
          <span className="mono secret-key">{grouped(setup.secret)}</span>
        </li>
        <li>Uygulamanın gösterdiği 6 haneli kodu aşağıya yaz.</li>
      </ol>
      <div className="field">
        <label htmlFor="code">Uygulamadaki kod</label>
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
        />
      </div>
      <div className="form-footer">
        <SubmitButton variant="primary">Kurulumu tamamla</SubmitButton>
        <FormFeedback state={state} saved="" />
      </div>
    </form>
  );
}
