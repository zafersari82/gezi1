"use client";

import {
  staffInvitationAcceptedSchema,
  staffInvitationPreviewSchema,
  staffInvitationTokenSchema,
} from "@vado/contracts";
import { useEffect, useState } from "react";
import { z } from "zod";

import { call, ClientApiError, errorMessage } from "../lib/client";
import { LoginForm } from "./login-form";

const SESSION_KEY = "vado.pendingStaffInvitation";

export function JoinInvitation() {
  const [token, setToken] = useState<string | null>(null);
  const [invitation, setInvitation] = useState<z.infer<typeof staffInvitationPreviewSchema> | null>(
    null,
  );
  const [needsLogin, setNeedsLogin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fragment = window.location.hash.slice(1);
    // The secret is in the fragment, never an HTTP URL or query parameter.
    if (fragment !== "") window.history.replaceState(null, "", "/join");
    if (fragment !== "") {
      if (staffInvitationTokenSchema.safeParse(fragment).success)
        sessionStorage.setItem(SESSION_KEY, fragment);
      else sessionStorage.removeItem(SESSION_KEY);
    }
    const saved = sessionStorage.getItem(SESSION_KEY);
    if (!staffInvitationTokenSchema.safeParse(saved).success) {
      setError("Davet bağlantısı bulunamadı veya geçersiz.");
      return;
    }
    setToken(saved);
    void call(
      staffInvitationPreviewSchema,
      "/api/invitations",
      "POST",
      {
        action: "preview",
        token: saved,
      },
      undefined,
      false,
    )
      .then((value) => {
        setInvitation(value);
        setNeedsLogin(false);
      })
      .catch((cause: unknown) => {
        if (cause instanceof ClientApiError && cause.status === 401) setNeedsLogin(true);
        else setError(errorMessage(cause));
      });
  }, []);

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
          <p>Şubeler: {invitation.branches.map((branch) => branch.name).join(", ")}</p>
          <p>
            Sipariş izni:{" "}
            {invitation.orderAccess === "manage"
              ? "İşlem yap"
              : invitation.orderAccess === "view"
                ? "Yalnız görüntüle"
                : "Yok"}
          </p>
          <p>Ürün bulunurluğu: {invitation.canManageAvailability ? "Yönetebilir" : "Yetki yok"}</p>
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
