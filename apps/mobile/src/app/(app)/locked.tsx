import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { unlockApp } from "@/features/security/app-lock";
import { confirmPresence } from "@/features/security/presence";
import { useSession } from "@/features/session/session-provider";
import { colors, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Button } from "@/ui/button";
import { Icon } from "@/ui/icon";

const PROMPT = "VADO kilidini aç";

/** Uygulama kilidi açıkken, cihazın kilidi geçilene kadar gösterilen tek ekran. */
export default function LockedScreen() {
  const { signOut } = useSession();
  const [failed, setFailed] = useState(false);

  // Ekran açılır açılmaz cihazın kilidi sorulur; kullanıcı vazgeçerse düğmeyle yeniden dener.
  useEffect(() => {
    let cancelled = false;
    void confirmPresence(PROMPT).then((confirmed) => {
      if (cancelled) return;
      if (confirmed) unlockApp();
      else setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function retry() {
    setFailed(false);
    if (await confirmPresence(PROMPT)) unlockApp();
    else setFailed(true);
  }

  return (
    <View style={styles.screen}>
      <Icon name="lock-closed" size={40} color="teal" />
      <View style={styles.texts}>
        <AppText variant="subheading" align="center">
          VADO kilitli
        </AppText>
        <AppText color="muted" align="center">
          Devam etmek için parmak izini, yüzünü ya da cihaz şifreni kullan.
        </AppText>
        {failed && (
          <AppText variant="callout" color="coral" align="center">
            Kilit açılamadı. Tekrar dene.
          </AppText>
        )}
      </View>
      <View style={styles.actions}>
        <Button label="Kilidi aç" onPress={() => void retry()} testID="unlock-app" />
        <Button label="Çıkış yap" variant="ghost" onPress={() => void signOut()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.xl,
    padding: space.xxl,
    backgroundColor: colors.surface,
  },
  texts: {
    gap: space.xs,
    maxWidth: 300,
  },
  actions: {
    alignSelf: "stretch",
    gap: space.sm,
  },
});
