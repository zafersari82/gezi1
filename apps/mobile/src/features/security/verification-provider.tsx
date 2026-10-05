import { formatPhone, OTP_LENGTH } from "@vado/contracts";
import { createContext, type ReactNode, use, useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";

import { ApiError, errorMessage } from "@/api/client";
import { CodeForm } from "@/features/auth/code-form";
import { cooldownSeconds } from "@/features/auth/otp";
import { deviceKey } from "@/features/session/device";
import { useMe } from "@/features/session/session-provider";
import { colors } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Button } from "@/ui/button";
import { Sheet } from "@/ui/sheet";

import { canConfirmPresence, confirmPresence } from "./presence";
import {
  confirmVerificationCode,
  fetchVerificationStatus,
  requestVerificationCode,
  verifyWithDeviceKey,
} from "./queries";

interface VerificationContextValue {
  /**
   * Hassas bir işlemi (ödeme onayı, hesap silme, başka oturumu kapatma) çalıştırır. Sunucu
   * kimliğin yeniden kanıtlanmasını isterse doğrulama penceresini açar ve doğrulama başarılıysa
   * işlemi bir kez daha dener.
   */
  withVerification: <T>(action: () => Promise<T>) => Promise<T>;
  /** Doğrulama penceresi açık mı? Aynı anda açık olan başka bir pencere bu sürede gizlenir. */
  verifying: boolean;
}

const VerificationContext = createContext<VerificationContextValue | null>(null);

type CodeRequest =
  | { status: "sending" }
  | { status: "sent"; resendInSeconds: number; devCode: string | null }
  | { status: "failed"; message: string };

/** Hesabın numarasına onay kodu gönderir ve kodun girilmesini bekler. */
function VerificationCode({ onVerified }: { onVerified: () => void }) {
  const me = useMe();
  const [attempt, setAttempt] = useState(0);
  const [request, setRequest] = useState<CodeRequest>({ status: "sending" });

  useEffect(() => {
    let cancelled = false;
    requestVerificationCode().then(
      (otp) => {
        if (cancelled) return;
        setRequest({
          status: "sent",
          resendInSeconds: otp.resendInSeconds,
          devCode: otp.devCode ?? null,
        });
      },
      (error: unknown) => {
        if (cancelled) return;
        // Az önce gönderilmiş bir kod varsa yenisi istenmez; kullanıcı elindeki kodu girer.
        const retryIn = cooldownSeconds(error);
        setRequest(
          retryIn === null
            ? { status: "failed", message: errorMessage(error) }
            : { status: "sent", resendInSeconds: retryIn, devCode: null },
        );
      },
    );
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return (
    <>
      <AppText color="muted">
        Bu işlem için {formatPhone(me.phone)} numarasına gönderdiğimiz {OTP_LENGTH} haneli kodu yaz.
      </AppText>
      {request.status === "sending" && <ActivityIndicator color={colors.teal} />}
      {request.status === "failed" && (
        <>
          <AppText variant="callout" color="coral">
            {request.message}
          </AppText>
          <Button
            label="Tekrar dene"
            variant="secondary"
            onPress={() => {
              setRequest({ status: "sending" });
              setAttempt(attempt + 1);
            }}
          />
        </>
      )}
      {request.status === "sent" && (
        <CodeForm
          onSubmit={async (code) => {
            await confirmVerificationCode(code);
            onVerified();
          }}
          onResend={requestVerificationCode}
          resendInSeconds={request.resendInSeconds}
          devCode={request.devCode}
        />
      )}
    </>
  );
}

/**
 * Tanınan cihazda SMS beklemeden doğrular: cihazın kilidi (parmak izi, yüz ya da şifre) sorulur,
 * geçilirse girişte verilen cihaz anahtarı sunucuya gönderilir.
 */
async function verifyOnDevice(): Promise<boolean> {
  const key = await deviceKey.read();
  if (key === null || !(await canConfirmPresence())) return false;
  if (!(await confirmPresence("Kimliğini doğrula"))) return false;
  return verifyWithDeviceKey(key).then(
    () => true,
    () => false,
  );
}

/**
 * Hassas işlemlerden önce kimliğin yeniden kanıtlanmasını yürütür. Giriş yapıldıktan sonra
 * doğrulama bir süre taze sayılır; bu sürede kullanıcıya yeniden sorulmaz.
 */
export function VerificationProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ resolve: (verified: boolean) => void } | null>(null);

  function finish(verified: boolean) {
    pending?.resolve(verified);
    setPending(null);
  }

  /**
   * Kimliği yeniden kanıtlar; kullanıcı vazgeçerse `false` döner. Tanınan cihazda önce cihazın
   * kilidi denenir; yeni cihazda, kilidi olmayan cihazda ya da web'de SMS kodu sorulur.
   */
  async function verify(): Promise<boolean> {
    const status = await fetchVerificationStatus();
    if (status.verified) return true;
    if (status.deviceKeyAllowed && (await verifyOnDevice())) return true;
    return new Promise((resolve) => {
      setPending({ resolve });
    });
  }

  const value: VerificationContextValue = {
    verifying: pending !== null,
    async withVerification(action) {
      try {
        return await action();
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== "verification_required") throw error;
        if (!(await verify())) throw error;
        return action();
      }
    },
  };

  return (
    <VerificationContext value={value}>
      {children}

      <Sheet
        visible={pending !== null}
        title="Kimliğini doğrula"
        onClose={() => {
          finish(false);
        }}
      >
        {pending !== null && (
          <VerificationCode
            onVerified={() => {
              finish(true);
            }}
          />
        )}
      </Sheet>
    </VerificationContext>
  );
}

export function useVerification(): VerificationContextValue {
  const context = use(VerificationContext);
  if (context === null) {
    throw new Error("useVerification, VerificationProvider içinde kullanılmalıdır");
  }
  return context;
}
