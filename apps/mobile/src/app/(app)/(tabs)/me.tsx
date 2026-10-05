import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { APP_VERSION } from "@/api/config";
import { useMe, useSession } from "@/features/session/session-provider";
import { colors, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Avatar } from "@/ui/avatar";
import { useFeedback } from "@/ui/feedback";
import { HeaderButton } from "@/ui/header-button";
import { IconTile } from "@/ui/icon";
import { ListRow } from "@/ui/list-row";
import { SectionTitle } from "@/ui/screen";

export default function MeScreen() {
  const me = useMe();
  const { signOut } = useSession();
  const { confirm } = useFeedback();

  async function confirmSignOut() {
    const confirmed = await confirm({
      title: "Çıkış yapılsın mı?",
      message: "Mesajların hesabında kalır; yeniden giriş yaptığında geri gelir.",
      confirmLabel: "Çıkış yap",
      destructive: true,
    });
    if (confirmed) await signOut();
  }

  return (
    <ScrollView style={styles.screen}>
      <View style={styles.profile}>
        <Pressable
          style={({ pressed }) => [styles.identity, pressed && styles.pressed]}
          accessibilityRole="button"
          accessibilityLabel="Profili düzenle"
          onPress={() => {
            router.push("/settings/profile");
          }}
          testID="edit-profile"
        >
          <Avatar name={me.displayName ?? ""} imageUrl={me.avatarUrl} size={64} />
          <View style={styles.profileText}>
            <AppText variant="heading" numberOfLines={1}>
              {me.displayName}
            </AppText>
            <AppText variant="callout" color="muted" numberOfLines={1}>
              {me.username === null ? "VADO kimliği belirlenmedi" : `@${me.username}`}
            </AppText>
          </View>
        </Pressable>
        <HeaderButton
          icon="qr-code-outline"
          label="QR kodum"
          onPress={() => {
            router.push("/my-qr");
          }}
          testID="open-my-qr"
        />
      </View>

      <SectionTitle>Hesap</SectionTitle>
      <ListRow
        title="Ödemeler"
        leading={<IconTile name="card" accent="teal" />}
        chevron
        onPress={() => {
          router.push("/payments");
        }}
        testID="open-payments"
      />
      <ListRow
        title="İşletme başvurusu"
        leading={<IconTile name="storefront" accent="ochre" />}
        chevron
        onPress={() => {
          router.push("/businesses/register");
        }}
      />

      <SectionTitle>Ayarlar</SectionTitle>
      <ListRow
        title="Gizlilik"
        leading={<IconTile name="lock-closed" accent="cobalt" />}
        chevron
        onPress={() => {
          router.push("/settings/privacy");
        }}
        testID="open-privacy"
      />
      <ListRow
        title="Bildirimler"
        leading={<IconTile name="notifications" accent="brick" />}
        chevron
        onPress={() => {
          router.push("/settings/notifications");
        }}
        testID="open-notifications"
      />
      <ListRow
        title="Mini uygulama izinleri"
        leading={<IconTile name="shield-checkmark" accent="emerald" />}
        chevron
        onPress={() => {
          router.push("/settings/permissions");
        }}
      />
      <ListRow
        title="Oturumlar"
        leading={<IconTile name="phone-portrait" accent="plum" />}
        chevron
        onPress={() => {
          router.push("/settings/sessions");
        }}
        testID="open-sessions"
      />

      <View style={styles.footer}>
        <ListRow
          title="Çıkış yap"
          titleColor="coral"
          onPress={() => void confirmSignOut()}
          testID="sign-out"
        />
        <AppText variant="caption" color="faint" align="center">
          VADO {APP_VERSION}
        </AppText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  // QR düğmesi profil satırının içinde değil yanında durur: dokunulabilir öğeler iç içe konmaz.
  profile: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: space.lg,
  },
  identity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
    padding: space.lg,
  },
  pressed: {
    backgroundColor: colors.mist,
  },
  profileText: {
    flex: 1,
    gap: 2,
  },
  footer: {
    gap: space.lg,
    marginTop: space.xl,
    paddingBottom: space.xxl,
  },
});
