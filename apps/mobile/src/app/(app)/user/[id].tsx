import type { UserProfile } from "@vado/contracts";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { errorMessage } from "@/api/client";
import { useOpenDirectConversation } from "@/features/chat/queries";
import {
  useAcceptContactRequest,
  useBlockUser,
  useDismissContactRequest,
  useRemoveContact,
  useSendContactRequest,
  useUnblockUser,
} from "@/features/contacts/queries";
import { ReportSheet } from "@/features/reports/report-sheet";
import { useMe } from "@/features/session/session-provider";
import { useUserProfile } from "@/features/users/queries";
import { colors, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Avatar } from "@/ui/avatar";
import { Button } from "@/ui/button";
import { useFeedback } from "@/ui/feedback";
import { HeaderActions, HeaderButton } from "@/ui/header-button";
import { Sheet } from "@/ui/sheet";
import { ErrorView, LoadingView } from "@/ui/states";

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useUserProfile(id);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const blockUser = useBlockUser();
  const { confirm, notify } = useFeedback();

  if (profile.isPending) return <LoadingView />;
  if (profile.isError) {
    return <ErrorView error={profile.error} onRetry={() => void profile.refetch()} />;
  }
  const user = profile.data;

  async function block() {
    setMenuOpen(false);
    const confirmed = await confirm({
      title: `${user.displayName} engellensin mi?`,
      message: "Kişilerinden çıkarılır; birbirinize mesaj ve istek gönderemezsiniz.",
      confirmLabel: "Engelle",
      destructive: true,
    });
    if (!confirmed) return;
    blockUser.mutate(user.id, {
      onError: (error) => {
        notify(errorMessage(error));
      },
    });
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          headerRight:
            user.relation === "self"
              ? undefined
              : () => (
                  <HeaderActions>
                    <HeaderButton
                      icon="ellipsis-horizontal"
                      label="Diğer seçenekler"
                      onPress={() => {
                        setMenuOpen(true);
                      }}
                    />
                  </HeaderActions>
                ),
        }}
      />

      <View style={styles.identity}>
        <Avatar name={user.displayName} imageUrl={user.avatarUrl} size={88} />
        <AppText variant="heading" align="center">
          {user.displayName}
        </AppText>
        {user.username !== null && (
          <AppText color="muted" align="center">
            @{user.username}
          </AppText>
        )}
        {user.bio !== "" && <AppText align="center">{user.bio}</AppText>}
      </View>

      <RelationActions user={user} />

      <Sheet
        visible={menuOpen}
        onClose={() => {
          setMenuOpen(false);
        }}
      >
        {user.relation !== "blocked" && (
          <Button label="Engelle" variant="danger" onPress={() => void block()} />
        )}
        <Button
          label="Şikayet et"
          variant="secondary"
          onPress={() => {
            setMenuOpen(false);
            setReporting(true);
          }}
        />
      </Sheet>
      <ReportSheet
        target={reporting ? { type: "user", id: user.id } : null}
        onClose={() => {
          setReporting(false);
        }}
      />
    </ScrollView>
  );
}

/** İlişkiye göre değişen eylemler: ekle, kabul et, mesaj gönder, engeli kaldır. */
function RelationActions({ user }: { user: UserProfile }) {
  const me = useMe();
  const sendRequest = useSendContactRequest();
  const acceptRequest = useAcceptContactRequest();
  const dismissRequest = useDismissContactRequest();
  const removeContact = useRemoveContact();
  const unblockUser = useUnblockUser();
  const openDirect = useOpenDirectConversation();
  const { confirm, notify } = useFeedback();
  const onError = (error: unknown) => {
    notify(errorMessage(error));
  };

  async function remove() {
    const confirmed = await confirm({
      title: `${user.displayName} kişilerinden çıkarılsın mı?`,
      message: "Sohbet geçmişiniz kalır ama yeniden kişi olana kadar mesajlaşamazsınız.",
      confirmLabel: "Kişilerden çıkar",
      destructive: true,
    });
    if (confirmed) removeContact.mutate(user.id, { onError });
  }

  switch (user.relation) {
    case "self":
      return (
        <Button
          label="Profili düzenle"
          variant="secondary"
          onPress={() => {
            router.push("/settings/profile");
          }}
        />
      );
    case "contact":
      return (
        <View style={styles.actions}>
          <Button
            label="Mesaj gönder"
            icon="chatbubble"
            loading={openDirect.isPending}
            onPress={() => {
              openDirect.mutate(user.id, {
                onSuccess: (conversation) => {
                  router.push({ pathname: "/chat/[id]", params: { id: conversation.id } });
                },
                onError,
              });
            }}
            testID="message-user"
          />
          <Button label="Kişilerden çıkar" variant="ghost" onPress={() => void remove()} />
        </View>
      );
    case "request_received":
      return (
        <View style={styles.actions}>
          <AppText color="muted" align="center">
            {user.displayName} seni kişilerine eklemek istiyor.
          </AppText>
          <Button
            label="Kabul et"
            loading={acceptRequest.isPending}
            onPress={() => {
              if (user.requestId !== null) acceptRequest.mutate(user.requestId, { onError });
            }}
            testID="accept-request"
          />
          <Button
            label="Reddet"
            variant="ghost"
            onPress={() => {
              if (user.requestId !== null) dismissRequest.mutate(user.requestId, { onError });
            }}
          />
        </View>
      );
    case "request_sent":
      return (
        <View style={styles.actions}>
          <AppText color="muted" align="center">
            İstek gönderildi. {user.displayName} kabul ettiğinde mesajlaşabilirsiniz.
          </AppText>
          <Button
            label="İsteği geri çek"
            variant="secondary"
            loading={dismissRequest.isPending}
            onPress={() => {
              if (user.requestId !== null) dismissRequest.mutate(user.requestId, { onError });
            }}
          />
        </View>
      );
    case "blocked":
      return (
        <View style={styles.actions}>
          <AppText color="muted" align="center">
            Bu kişiyi engelledin.
          </AppText>
          <Button
            label="Engeli kaldır"
            variant="secondary"
            loading={unblockUser.isPending}
            onPress={() => {
              unblockUser.mutate(user.id, { onError });
            }}
          />
        </View>
      );
    case "none":
      return (
        <Button
          label="Kişilerime ekle"
          icon="person-add"
          loading={sendRequest.isPending}
          onPress={() => {
            sendRequest.mutate(
              { userId: user.id, message: `Merhaba, ben ${me.displayName ?? ""}.`.trim() },
              { onError },
            );
          }}
          testID="add-user"
        />
      );
  }
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    gap: space.xl,
    padding: space.xl,
  },
  identity: {
    alignItems: "center",
    gap: space.sm,
  },
  actions: {
    gap: space.sm,
  },
});
