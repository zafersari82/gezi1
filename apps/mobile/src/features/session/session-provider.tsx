import type { AuthResult, Me } from "@vado/contracts";
import { createContext, type ReactNode, use, useEffect, useState } from "react";

import { api, apiSession } from "@/api/client";
import { queryClient } from "@/api/query-client";
import { loadAppLock, setAppLockEnabled } from "@/features/security/app-lock";

import { deviceKey } from "./device";
import { secureStorage } from "./secure-storage";

const STORAGE_KEY = "vado.session";

interface StoredSession {
  token: string;
  me: Me;
}

type SessionState =
  { status: "loading" } | { status: "signedOut" } | { status: "signedIn"; me: Me };

interface SessionContextValue {
  state: SessionState;
  /** Doğrulama sonucunu kaydeder ve oturumu başlatır. */
  signIn: (result: AuthResult) => Promise<void>;
  /** Sunucudaki oturumu kapatır ve cihazdaki tüm oturum verisini siler. */
  signOut: () => Promise<void>;
  /** Profil güncellendiğinde bellekteki ve cihazdaki hesap bilgisini yeniler. */
  setMe: (me: Me) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

async function readStoredSession(): Promise<StoredSession | null> {
  const raw = await secureStorage.get(STORAGE_KEY);
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as StoredSession;
  } catch {
    await secureStorage.remove(STORAGE_KEY);
    return null;
  }
}

function storeSession(session: StoredSession): Promise<void> {
  return secureStorage.set(STORAGE_KEY, JSON.stringify(session));
}

/** Cihazdaki oturumu ve önbelleğe alınmış tüm veriyi siler; sunucuya istek göndermez. */
async function clearStoredSession(): Promise<void> {
  // Kilit ayarı ilk sıfırlanır: ekranları yeniden çizdirir ve o anda oturum verisi yerinde olmalıdır.
  await setAppLockEnabled(false);
  apiSession.setToken(null);
  queryClient.clear();
  await secureStorage.remove(STORAGE_KEY);
  await deviceKey.clear();
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  // Açılışta kayıtlı oturum yüklenir; hesap bilgisi arka planda sunucudan tazelenir.
  useEffect(() => {
    let cancelled = false;

    apiSession.onUnauthorized(() => {
      void clearStoredSession().then(() => {
        if (!cancelled) setState({ status: "signedOut" });
      });
    });

    // Ağ yoksa kayıtlı bilgiyle devam edilir; oturum geçersizse istemci çıkış yaptırır.
    async function refresh(token: string): Promise<void> {
      const me = await api.get<Me>("/v1/me").catch(() => null);
      if (cancelled || me === null || apiSession.getToken() !== token) return;
      setState({ status: "signedIn", me });
      await storeSession({ token, me });
    }

    async function restore(): Promise<void> {
      const stored = await readStoredSession().catch(() => null);
      // Kilit ayarı ekranlar çizilmeden önce okunur; kilitli uygulamada içerik bir an bile görünmez.
      if (stored !== null) await loadAppLock();
      if (cancelled) return;
      if (stored === null) {
        setState({ status: "signedOut" });
        return;
      }
      apiSession.setToken(stored.token);
      setState({ status: "signedIn", me: stored.me });
      await refresh(stored.token);
    }
    void restore();

    return () => {
      cancelled = true;
      apiSession.onUnauthorized(null);
    };
  }, []);

  const value: SessionContextValue = {
    state,
    async signIn(result) {
      apiSession.setToken(result.token);
      await storeSession({ token: result.token, me: result.user });
      await deviceKey.store(result.deviceKey);
      setState({ status: "signedIn", me: result.user });
    },
    async signOut() {
      // Sunucuya ulaşılamasa da cihazdaki oturum kapatılır.
      await api.post("/v1/auth/logout").catch(() => undefined);
      await clearStoredSession();
      setState({ status: "signedOut" });
    },
    setMe(me) {
      setState({ status: "signedIn", me });
      const token = apiSession.getToken();
      if (token !== null) void storeSession({ token, me });
    },
  };

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionContextValue {
  const context = use(SessionContext);
  if (context === null) throw new Error("useSession, SessionProvider içinde kullanılmalıdır");
  return context;
}

/** Oturum açmış kullanıcının hesabı. Yalnızca oturum gerektiren ekranlarda kullanılır. */
export function useMe(): Me {
  const { state } = useSession();
  if (state.status !== "signedIn") throw new Error("useMe için oturum açılmış olmalıdır");
  return state.me;
}
