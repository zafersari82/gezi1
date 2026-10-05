import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { errorMessage } from "@/api/client";
import { useBlockedUsers, useUnblockUser } from "@/features/contacts/queries";
import { setAppLockEnabled, useAppLock } from "@/features/security/app-lock";
import { canConfirmPresence, confirmPresence } from "@/features/security/presence";
import { useMe } from "@/features/session/session-provider";
import { useDeleteAccount, useUpdateMe } from "@/features/users/queries";
import { colors, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Avatar } from "@/ui/avatar";
import { Button } from "@/ui/button";
import { useFeedback } from "@/ui/feedback";
import { ListRow } from "@/ui/list-row";
import { SectionTitle } from "@/ui/screen";
import { Toggle } from "@/ui/toggle";

export default function PrivacyScreen() {
  const me = useMe();
  const updateMe = useUpdateMe();
  const blocked = useBlockedUsers();
  const unblock = useUnblockUser();
  const deleteAccount = useDeleteAccount();
  const appLock = useAppLock();
  const [lockAvailable, setLockAvailable] = useState(false);

  // Kilit yalnızca parmak izi, yüz ya da ekran kilidi şifresi tanımlı cihazlarda sunulur.
  useEffect(() => {
    void canConfirmPresence().then(setLockAvailable);
  }, []);
  const { confirm, notify } = useFeedback();
  const onError = (error: unknown) => {
    notify(errorMessage(error));
  };

  /** Kilidi açarken de kapatırken de cihazın kilidi sorulur; başkası ayarı değiştiremez. */
  async function changeAppLock(enabled: boolean) {
    const reason = enabled ? "Uygulama kilidini aç" : "Uygulama kilidini kapat";
    if (await confirmPresence(reason)) await setAppLockEnabled(enabled);
  }

  async function confirmDelete() {
    const confirmed = await confirm({
      title: "Hesabın kalıcı olarak silinsin mi?",
      message:
        "Profilin, kişilerin ve paylaşımların silinir; gruplardan çıkarılırsın. Gönderdiğin mesajlar karşı tarafta “Silinmiş Hesap” adıyla kalır. Bu işlem geri alınamaz.",
      confirmLabel: "Hesabımı sil",
      destructive: true,
    });
    if (confirmed) deleteAccount.mutate(undefined, { onError });
  }

  return (
    <ScrollView style={styles.screen}>
      <ListRow
        title="Telefon numaramla bulunabileyim"
        subtitle="Kapalıyken yalnızca VADO kimliğin veya QR kodunla eklenebilirsin."
        subtitleLines={3}
        trailing={
          <Toggle
            value={me.discoverableByPhone}
            onChange={(value) => {
              updateMe.mutate({ discoverableByPhone: value }, { onError });
            }}
            label="Telefon numaramla bulunabileyim"
          />
        }
      />

      {lockAvailable && (
        <ListRow
          title="Uygulama kilidi"
          subtitle="VADO açılırken parmak izi, yüz ya da cihaz şifresi sorulur."
          subtitleLines={3}
          trailing={
            <Toggle
              value={appLock.enabled}
              onChange={(value) => void changeAppLock(value)}
              label="Uygulama kilidi"
            />
          }
        />
      )}

      <SectionTitle>Engellenenler</SectionTitle>
      {(blocked.data ?? []).length === 0 ? (
        <AppText color="muted" style={styles.note}>
          Engellediğin kimse yok.
        </AppText>
      ) : (
        blocked.data?.map((user) => (
          <ListRow
            key={user.id}
            title={user.displayName}
            leading={<Avatar name={user.displayName} imageUrl={user.avatarUrl} size={40} />}
            trailing={
              <Button
                label="Engeli kaldır"
                variant="secondary"
                size="small"
                onPress={() => {
                  unblock.mutate(user.id, { onError });
                }}
              />
            }
          />
        ))
      )}

      <SectionTitle>Hukuki metinler</SectionTitle>
      <ListRow
        title="Kullanım Koşulları"
        chevron
        onPress={() => {
          router.push("/legal/terms");
        }}
      />
      <ListRow
        title="KVKK Aydınlatma Metni"
        chevron
        onPress={() => {
          router.push("/legal/privacy");
        }}
      />

      <View style={styles.danger}>
        <Button
          label="Hesabımı sil"
          variant="danger"
          loading={deleteAccount.isPending}
          onPress={() => void confirmDelete()}
          testID="delete-account"
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  note: {
    paddingHorizontal: space.lg,
  },
  danger: {
    padding: space.xl,
  },
});
