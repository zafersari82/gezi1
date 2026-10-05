import { OTP_LENGTH, type RequestOtpResponse } from "@vado/contracts";
import { useEffect, useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";

import { errorMessage } from "@/api/client";
import { formatCountdown } from "@/lib/format";
import { colors, radius, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Button } from "@/ui/button";

interface CodeFormProps {
  /** Kodu doğrular; hata fırlatırsa iletisi formda gösterilir ve kod kutusu boşaltılır. */
  onSubmit: (code: string) => Promise<void>;
  /** Yeni kod ister; yanıt bekleme süresini ve deneme modunda kodun kendisini taşır. */
  onResend: () => Promise<RequestOtpResponse>;
  /** Yeni kod istenebilmesi için kalan süre. */
  resendInSeconds: number;
  /** Deneme modunda sunucunun bildirdiği kod; canlı ortamda `null`. */
  devCode: string | null;
}

/** SMS ile gelen altı haneli kodun girildiği form: giriş ve işlem onayı aynı formu kullanır. */
export function CodeForm({ onSubmit, onResend, resendInSeconds, devCode }: CodeFormProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"submit" | "resend" | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(resendInSeconds);
  const [shownDevCode, setShownDevCode] = useState(devCode);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => {
      setSecondsLeft(secondsLeft - 1);
    }, 1000);
    return () => {
      clearTimeout(timer);
    };
  }, [secondsLeft]);

  async function submit(value: string) {
    setError(null);
    setBusy("submit");
    try {
      await onSubmit(value);
    } catch (cause) {
      setCode("");
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  function changeCode(value: string) {
    const digits = value.replace(/\D/g, "").slice(0, OTP_LENGTH);
    setCode(digits);
    setError(null);
    // Son hane yazıldığında ayrıca düğmeye basmaya gerek kalmaz.
    if (digits.length === OTP_LENGTH) void submit(digits);
  }

  async function resend() {
    setError(null);
    setBusy("resend");
    try {
      const otp = await onResend();
      setSecondsLeft(otp.resendInSeconds);
      setShownDevCode(otp.devCode ?? null);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <TextInput
        value={code}
        onChangeText={changeCode}
        keyboardType="number-pad"
        autoComplete="sms-otp"
        textContentType="oneTimeCode"
        maxLength={OTP_LENGTH}
        autoFocus
        editable={busy !== "submit"}
        accessibilityLabel="Doğrulama kodu"
        placeholder={"•".repeat(OTP_LENGTH)}
        placeholderTextColor={colors.line}
        style={[styles.code, error !== null && styles.codeError]}
        testID="code-input"
      />
      {error !== null && (
        <AppText variant="callout" color="coral">
          {error}
        </AppText>
      )}

      <Button
        label="Doğrula"
        onPress={() => void submit(code)}
        loading={busy === "submit"}
        disabled={code.length < OTP_LENGTH}
      />
      <Button
        label={
          secondsLeft > 0 ? `Yeni kod iste (${formatCountdown(secondsLeft)})` : "Yeni kod iste"
        }
        variant="ghost"
        onPress={() => void resend()}
        loading={busy === "resend"}
        disabled={secondsLeft > 0}
      />

      {shownDevCode !== null && (
        <View style={styles.demo}>
          <AppText variant="callout" color="amber">
            Deneme modundasın: SMS gönderilmez, kod {shownDevCode}.
          </AppText>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  code: {
    height: 64,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    color: colors.ink,
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: 12,
    textAlign: "center",
    outlineWidth: 0,
  },
  codeError: {
    borderColor: colors.coral,
  },
  demo: {
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.amberSoft,
  },
});
