import { formatPhone, normalizePhone } from "@vado/contracts";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { errorMessage } from "@/api/client";
import logo from "@/assets/images/logo.png";
import { cooldownSeconds } from "@/features/auth/otp";
import { useRequestOtp } from "@/features/auth/queries";
import { colors, radius, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Button } from "@/ui/button";
import { Icon } from "@/ui/icon";
import { Lattice } from "@/ui/lattice";
import { TextField } from "@/ui/text-field";

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const requestOtp = useRequestOtp();
  const [phone, setPhone] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [termsError, setTermsError] = useState(false);

  const normalized = normalizePhone(phone);

  function submit() {
    if (normalized === null) {
      setPhoneError("Cep telefonu numaranı 05xx xxx xx xx biçiminde yaz.");
      return;
    }
    if (!accepted) {
      setTermsError(true);
      return;
    }
    setPhoneError(null);
    requestOtp.mutate(normalized, {
      onSuccess: (otp) => {
        router.push({
          pathname: "/verify",
          params: {
            phone: normalized,
            resendIn: String(otp.resendInSeconds),
            ...(otp.devCode === undefined ? {} : { devCode: otp.devCode }),
          },
        });
      },
      onError: (cause) => {
        // Az önce gönderilen kod hâlâ geçerlidir; kullanıcı bekletilmeden kod ekranına alınır.
        const resendIn = cooldownSeconds(cause);
        if (resendIn === null) {
          setPhoneError(errorMessage(cause));
          return;
        }
        router.push({
          pathname: "/verify",
          params: { phone: normalized, resendIn: String(resendIn) },
        });
      },
    });
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bounces={false}
      >
        <View style={[styles.hero, { paddingTop: insets.top + space.xxl }]}>
          <Lattice width={width} height={height} color={colors.white} opacity={0.14} />
          <Image source={logo} style={styles.logo} accessibilityLabel="VADO" />
          <AppText variant="title" color="white" style={styles.wordmark}>
            VADO
          </AppText>
          <AppText color="white" style={styles.tagline}>
            Mesajlaş, keşfet, öde.{"\n"}Hepsi tek uygulamada.
          </AppText>
        </View>

        <View style={[styles.form, { paddingBottom: insets.bottom + space.xl }]}>
          <TextField
            label="Telefon numaran"
            placeholder="05xx xxx xx xx"
            value={phone}
            onChangeText={(value) => {
              setPhone(value);
              setPhoneError(null);
            }}
            keyboardType="phone-pad"
            autoComplete="tel"
            textContentType="telephoneNumber"
            returnKeyType="done"
            onSubmitEditing={submit}
            hint={normalized === null ? undefined : formatPhone(normalized)}
            error={phoneError}
            testID="phone-input"
          />

          <Pressable
            style={styles.terms}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: accepted }}
            onPress={() => {
              setAccepted(!accepted);
              setTermsError(false);
            }}
            testID="terms-checkbox"
          >
            <Icon
              name={accepted ? "checkbox" : "square-outline"}
              color={accepted ? "teal" : termsError ? "coral" : "faint"}
            />
            <AppText variant="callout" color="muted" style={styles.termsText}>
              <AppText
                variant="callout"
                color="teal"
                onPress={() => {
                  router.push("/legal/terms");
                }}
              >
                Kullanım Koşulları
              </AppText>
              'nı ve{" "}
              <AppText
                variant="callout"
                color="teal"
                onPress={() => {
                  router.push("/legal/privacy");
                }}
              >
                KVKK Aydınlatma Metni
              </AppText>
              'ni okudum, kabul ediyorum.
            </AppText>
          </Pressable>
          {termsError && (
            <AppText variant="caption" color="coral">
              Devam etmek için koşulları kabul etmelisin.
            </AppText>
          )}

          <Button
            label="Kod gönder"
            onPress={submit}
            loading={requestOtp.isPending}
            testID="send-code"
          />
          <AppText variant="caption" color="muted">
            Numarana SMS ile 6 haneli bir doğrulama kodu göndeririz.
          </AppText>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.teal,
  },
  content: {
    flexGrow: 1,
  },
  hero: {
    flexGrow: 1,
    justifyContent: "flex-end",
    minHeight: 280,
    paddingHorizontal: space.xl,
    paddingBottom: space.xxl + radius.xl,
    overflow: "hidden",
    backgroundColor: colors.teal,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 19,
  },
  wordmark: {
    marginTop: space.lg,
    fontSize: 34,
    lineHeight: 40,
    letterSpacing: 2,
  },
  tagline: {
    marginTop: space.xs,
    opacity: 0.85,
  },
  form: {
    gap: space.lg,
    marginTop: -radius.xl,
    padding: space.xl,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.surface,
  },
  terms: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space.sm,
  },
  termsText: {
    flex: 1,
  },
});
