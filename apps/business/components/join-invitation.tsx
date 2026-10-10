"use client";

import {
  staffInvitationAcceptedSchema,
  type StaffInvitationPreview,
  staffInvitationPreviewSchema,
  staffInvitationTokenSchema,
} from "@vado/contracts";
import { useEffect, useState } from "react";
import { z } from "zod";

import { grantSummary } from "../lib/access";
import { call, ClientApiError, errorMessage } from "../lib/client";
import { LoginForm } from "./login-form";

const SESSION_KEY = "vado.pendingStaffInvitation";

/**
 * Belirteç adresin `#` parçasındadır; sunucuya ve geçmişe gitmez. Okununca adresten silinir ve
 * giriş sonrasında kullanılmak üzere yalnız bu sekmenin oturum belleğinde tutulur.
 */
function readInvitationToken(): string | null {
  const fragment = window.location.hash.slice(1);
  if (fragment !== "") {
    window.history.replaceState(null, "", "/join");
    if (staffInvitationTokenSchema.safeParse(fragment).success)
      sessionStorage.setItem(SESSION_KEY, fragment);
    else sessionStorage.removeItem(SESSION_KEY);
  }
  const saved = sessionStorage.getItem(SESSION_KEY);
  return staffInvitationTokenSchema.safeParse(saved).success ? saved : null;
}

export function JoinInvitation() {
  const [token] = useState(readInvitationToken);
  const [invitation, setInvitation] = useState<StaffInvitationPreview | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(
    token === null ? "Davet bağlantısı bulunamadı veya geçersiz." : "",
  );

  useEffect(() => {
    if (token === null) return;
    let active = true;
    call(
      staffInvitationPreviewSchema,
      "/api/invitations",
      "POST",
      { action: "preview", token },
      undefined,
      false,
    )
      .then((value) => {
        if (!active) return;
        setInvitation(value);
        setNeedsLogin(false);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ClientApiError && cause.status === 401) setNeedsLogin(true);
        else setError(errorMessage(cause));
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function accept() {
    if (token === null) return;
    setBusy(true);
    setError("");
    try {
      await call(staffInvitationAcceptedSchema, "/api/invitations", "POST", {
        action: "accept",
        token,
      });
      sessionStorage.removeItem(SESSION_KEY);
      window.location.assign("/orders");
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }
  async function switchAccount() {
    await call(z.object({ ok: z.boolean() }), "/api/auth/logout", "POST").catch(() => undefined);
    setInvitation(null);
    setNeedsLogin(true);
    setError("");
  }

  return (
    <section className="panel">
      <h1>İşletme davetini kabul et</h1>
      <p className="muted">
        Davet yalnızca belirtilen telefon numarasıyla doğrulanmış VADO hesabında kullanılabilir.
      </p>
      {needsLogin ? (
        <>
          <p>Devam etmek için kendi VADO hesabına giriş yap.</p>
          <LoginForm redirectTo="/join" />
        </>
      ) : invitation !== null ? (
        <>
          <h2>{invitation.businessName}</h2>
          <p>Bu davetle şu izinleri alacaksın:</p>
          <ul className="grant-summary">
            {grantSummary(invitation.grants).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="small muted">
            Bu davet bir kez kullanılabilir, süresi dolana kadar geçerlidir.
          </p>
          <button className="primary" type="button" disabled={busy} onClick={() => void accept()}>
            {busy ? "Kabul ediliyor…" : "Daveti kabul et"}
          </button>
          <button
            className="text-button"
            type="button"
            disabled={busy}
            onClick={() => void switchAccount()}
          >
            Farklı VADO hesabıyla giriş yap
          </button>
        </>
      ) : token !== null && error === "" ? (
        <p>Daveti kontrol ediyorum…</p>
      ) : null}
      {error !== "" && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {error !== "" && token !== null && !needsLogin && (
        <button type="button" className="text-button" onClick={() => void switchAccount()}>
          Başka telefon numarasıyla giriş yap
        </button>
      )}
    </section>
  );
}
