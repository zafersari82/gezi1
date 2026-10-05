import { formatPhone, OTP_LENGTH } from "@vado/contracts";
import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

import { CodeForm } from "@/features/auth/code-form";
import { useRequestOtp, useVerifyOtp } from "@/features/auth/queries";
import { useSession } from "@/features/session/session-provider";
import { space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Screen } from "@/ui/screen";

const DEFAULT_RESEND_SECONDS = 60;

export default function VerifyScreen() {
  const params = useLocalSearchParams<{ phone: string; resendIn?: string; devCode?: string }>();
  const { signIn } = useSession();
  const verifyOtp = useVerifyOtp();
  const requestOtp = useRequestOtp();

  return (
    <Screen scroll padded>
      <View style={styles.intro}>
        <AppText variant="title">Kodu gir</AppText>
        <AppText color="muted">
          {formatPhone(params.phone)} numarasına gönderdiğimiz {OTP_LENGTH} haneli kodu yaz.
        </AppText>
      </View>

      <CodeForm
        onSubmit={async (code) => {
          await signIn(await verifyOtp.mutateAsync({ phone: params.phone, code }));
        }}
        onResend={() => requestOtp.mutateAsync(params.phone)}
        resendInSeconds={Number(params.resendIn ?? DEFAULT_RESEND_SECONDS)}
        devCode={params.devCode ?? null}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: {
    gap: space.sm,
  },
});
