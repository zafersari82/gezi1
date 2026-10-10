"use client";

import { requestOtpResponseSchema } from "@vado/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { call, errorMessage } from "../lib/client";

export function LoginForm({ redirectTo = "/businesses" }: { redirectTo?: string } = {}) {
  const [phone, setPhone] = useState("");
  const [requested, setRequested] = useState(false);
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function submit(event: React.SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!requested) {
        const result = await call(requestOtpResponseSchema, "/api/auth/otp", "POST", { phone });
        setDevCode(result.devCode);
        setRequested(true);
      } else {
        await call(z.object({ ok: z.boolean() }), "/api/auth/verify", "POST", { phone, code });
        if (redirectTo === "/join") window.location.assign("/join");
        else {
          router.replace(redirectTo);
          router.refresh();
        }
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="form-stack">
      <label>
        Telefon numaran
        <input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="05xx xxx xx xx"
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
          }}
          required
          disabled={requested || busy}
          maxLength={32}
        />
      </label>
      {requested && (
        <>
          <label>
            Doğrulama kodu
            <input
              autoFocus
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
              }}
              required
            />
          </label>
          <p className="muted">Telefonuna gelen altı haneli kodu yaz.</p>
          {devCode !== undefined && (
            <p className="notice">
              Demo doğrulama kodu: <strong>{devCode}</strong>
            </p>
          )}
          <button
            type="button"
            className="text-button"
            onClick={() => {
              setRequested(false);
              setCode("");
              setError("");
            }}
          >
            Numarayı değiştir veya yeni kod iste
          </button>
        </>
      )}
      {error !== "" && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button className="primary" disabled={busy}>
        {busy ? "Bekle…" : requested ? "Giriş yap" : "Kod gönder"}
      </button>
      <p className="small muted">
        İşletme üyeliğin yoksa işletme sahibinden kendi VADO hesabına yetki vermesini iste.
      </p>
    </form>
  );
}
