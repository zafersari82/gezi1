import { type ConversationMember, GROUP_TITLE_MAX } from "@vado/contracts";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { errorMessage } from "@/api/client";
import { useConversation, useRemoveMember, useRenameGroup } from "@/features/chat/queries";
import { useMe } from "@/features/session/session-provider";
import { colors, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Avatar } from "@/ui/avatar";
import { Tag } from "@/ui/badge";
import { Button } from "@/ui/button";
import { useFeedback } from "@/ui/feedback";
import { IconTile } from "@/ui/icon";
import { ListRow } from "@/ui/list-row";
import { SectionTitle } from "@/ui/screen";
import { Sheet } from "@/ui/sheet";
import { ErrorView, LoadingView } from "@/ui/states";
import { TextField } from "@/ui/text-field";

export default function ChatInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const conversation = useConversation(id);
  const renameGroup = useRenameGroup(id);
  const removeMember = useRemoveMember(id);
  const { confirm, notify } = useFeedback();
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState("");

  if (conversation.isPending) return <LoadingView />;
  if (conversation.isError) {
    return <ErrorView error={conversation.error} onRetry={() => void conversation.refetch()} />;
  }

  const detail = conversation.data;
  const isGroup = detail.kind === "group";
  const isOwner = detail.members.some((member) => member.id === me.id && member.role === "owner");
  const openProfile = (userId: string) => {
    router.push({ pathname: "/user/[id]", params: { id: userId } });
  };

  async function leave() {
    const confirmed = await confirm({
      title: "Gruptan ayrılmak istiyor musun?",
      message: "Grubun mesajlarını artık göremezsin.",
      confirmLabel: "Gruptan ayrıl",
      destructive: true,
    });
    if (!confirmed) return;
    removeMember.mutate(me.id, {
      onSuccess: () => {
        router.dismissTo("/");
      },
      onError: (error) => {
        notify(errorMessage(error));
      },
    });
  }

  async function pressMember(member: ConversationMember) {
    if (!isOwner || member.id === me.id) {
      openProfile(member.id);
      return;
    }
    const confirmed = await confirm({
      title: `${member.displayName} gruptan çıkarılsın mı?`,
      confirmLabel: "Gruptan çıkar",
      destructive: true,
    });
    if (!confirmed) return;
    removeMember.mutate(member.id, {
      onError: (error) => {
        notify(errorMessage(error));
      },
    });
  }

  return (
    <ScrollView style={styles.screen}>
      <View style={styles.header}>
        <Avatar name={detail.title} imageUrl={detail.avatarUrl} size={72} group={isGroup} />
        <AppText variant="heading" align="center">
          {detail.title}
        </AppText>
        {isGroup && isOwner && (
          <Button
            label="Adı değiştir"
            variant="ghost"
            size="small"
            onPress={() => {
              setTitle(detail.title);
              setRenaming(true);
            }}
          />
        )}
      </View>

      {isGroup ? (
        <>
          <SectionTitle>{`${detail.memberCount} üye`}</SectionTitle>
          <ListRow
            title="Üye ekle"
            titleColor="teal"
            leading={<IconTile name="person-add" accent="teal" size={44} />}
            onPress={() => {
              router.push({ pathname: "/chat/new", params: { addTo: id } });
            }}
            testID="add-member"
          />
          {detail.members.map((member) => (
            <ListRow
              key={member.id}
              title={member.id === me.id ? `${member.displayName} (sen)` : member.displayName}
              leading={<Avatar name={member.displayName} imageUrl={member.avatarUrl} size={44} />}
              trailing={member.role === "owner" ? <Tag label="Yönetici" tone="positive" /> : null}
              onPress={() => void pressMember(member)}
            />
          ))}
          <View style={styles.actions}>
            <Button
              label="Gruptan ayrıl"
              variant="danger"
              loading={removeMember.isPending}
              onPress={() => void leave()}
              testID="leave-group"
            />
          </View>
        </>
      ) : (
        detail.peerId !== null && (
          <ListRow
            title="Profili görüntüle"
            chevron
            onPress={() => {
              if (detail.peerId !== null) openProfile(detail.peerId);
            }}
          />
        )
      )}

      <Sheet
        visible={renaming}
        title="Grup adı"
        onClose={() => {
          setRenaming(false);
        }}
      >
        <TextField
          label="Yeni ad"
          value={title}
          onChangeText={setTitle}
          maxLength={GROUP_TITLE_MAX}
          autoFocus
        />
        <Button
          label="Kaydet"
          disabled={title.trim() === "" || title.trim() === detail.title}
          loading={renameGroup.isPending}
          onPress={() => {
            renameGroup.mutate(title.trim(), {
              onSuccess: () => {
                setRenaming(false);
              },
              onError: (error) => {
                notify(errorMessage(error));
              },
            });
          }}
        />
      </Sheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  header: {
    alignItems: "center",
    gap: space.sm,
    padding: space.xl,
  },
  actions: {
    padding: space.xl,
  },
});
