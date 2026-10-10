import type { ConversationDetail } from "@vado/contracts";
import { router, Stack, useIsFocused, useLocalSearchParams } from "expo-router";
import { useHeaderHeight } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from "react-native";

import { buildChatItems, type ChatItem } from "@/features/chat/chat-items";
import { Composer } from "@/features/chat/composer";
import { ChatNote, MessageBubble } from "@/features/chat/message-bubble";
import { useOutgoingMessages } from "@/features/chat/outbox";
import { deliver, useConversation, useMarkRead, useMessages } from "@/features/chat/queries";
import { useTypingUserIds } from "@/features/chat/typing";
import { startVideoCall } from "@/features/chat/video-call";
import { ImageViewer } from "@/features/media/image-viewer";
import { ReportSheet } from "@/features/reports/report-sheet";
import { useMe } from "@/features/session/session-provider";
import { formatChatStamp } from "@/lib/format";
import { colors, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { HeaderActions, HeaderButton } from "@/ui/header-button";
import { ErrorView, LoadingView } from "@/ui/states";

/** Başlığın altındaki satır: yazan kişi varsa onu, yoksa grup üye sayısını gösterir. */
function subtitleOf(conversation: ConversationDetail, typingIds: string[]): string | null {
  const typist = conversation.members.find((member) => typingIds.includes(member.id));
  if (typist !== undefined) {
    return conversation.kind === "group"
      ? `${typist.displayName.split(" ")[0] ?? typist.displayName} yazıyor…`
      : "yazıyor…";
  }
  return conversation.kind === "group" ? `${conversation.memberCount} üye` : null;
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const focused = useIsFocused();
  const headerHeight = useHeaderHeight();
  const conversation = useConversation(id);
  const messages = useMessages(id);
  const outgoing = useOutgoingMessages(id);
  const typingIds = useTypingUserIds(id);
  const { mutate: markRead } = useMarkRead(id);
  const [viewedImage, setViewedImage] = useState<string | null>(null);
  const [reportedId, setReportedId] = useState<string | null>(null);
  const lastMarkedSeq = useRef(0);

  const detail = conversation.data;
  const loaded = messages.data?.pages.flatMap((page) => page.items) ?? [];
  const newest = loaded[0];
  const newestSeq = newest?.seq;
  const newestIsMine = newest?.senderId === me.id;
  const myReadSeq = detail?.members.find((member) => member.id === me.id)?.lastReadSeq;

  // Ekran açıkken gelen mesajlar okundu sayılır; kendi mesajını sunucu zaten okundu kabul eder.
  useEffect(() => {
    if (!focused || newestSeq === undefined || myReadSeq === undefined || newestIsMine) return;
    if (newestSeq <= myReadSeq || newestSeq <= lastMarkedSeq.current) return;
    lastMarkedSeq.current = newestSeq;
    markRead(newestSeq);
  }, [focused, newestSeq, newestIsMine, myReadSeq, markRead]);

  if (conversation.isPending || messages.isPending) return <LoadingView />;
  if (conversation.isError || messages.isError) {
    return (
      <ErrorView
        error={conversation.error ?? messages.error}
        onRetry={() => {
          void conversation.refetch();
          void messages.refetch();
        }}
      />
    );
  }

  const isGroup = conversation.data.kind === "group";
  const subtitle = subtitleOf(conversation.data, typingIds);
  const items = buildChatItems(loaded, outgoing, isGroup);

  // Birebir sohbette en son kendi mesajının altında karşı tarafın okuyup okumadığı yazar.
  const lastOwnSeq = loaded.find((message) => message.senderId === me.id)?.seq;
  const peerReadSeq =
    isGroup || conversation.data.kind === "business"
      ? null
      : (conversation.data.members.find((member) => member.id !== me.id)?.lastReadSeq ?? 0);
  const nameOf = (userId: string | null) =>
    conversation.data.members.find((member) => member.id === userId)?.displayName ?? null;

  function renderItem({ item }: { item: ChatItem }) {
    if (item.type === "stamp") return <ChatNote text={formatChatStamp(item.at)} />;

    if (item.type === "outgoing") {
      const { message } = item;
      return (
        <MessageBubble
          body={message.body}
          imageUrl={message.image?.uri ?? null}
          mine
          pending={message.error === null}
          footnote={message.error === null ? null : `${message.error} Yeniden denemek için dokun.`}
          footnoteTone="coral"
          onPress={message.error === null ? undefined : () => void deliver(message)}
        />
      );
    }

    const { message } = item;
    if (message.kind === "system") return <ChatNote text={message.body} />;
    const mine = message.senderId === me.id;
    const { imageUrl } = message;
    return (
      <MessageBubble
        body={message.body}
        imageUrl={imageUrl}
        mine={mine}
        senderName={!mine && item.showSender ? nameOf(message.senderId) : null}
        footnote={
          mine && peerReadSeq !== null && message.seq === lastOwnSeq
            ? peerReadSeq >= message.seq
              ? "Okundu"
              : "İletildi"
            : null
        }
        onPress={
          imageUrl === null
            ? undefined
            : () => {
                setViewedImage(imageUrl);
              }
        }
        onLongPress={
          mine
            ? undefined
            : () => {
                setReportedId(message.id);
              }
        }
      />
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View>
              <AppText variant="subheading" numberOfLines={1}>
                {conversation.data.title}
              </AppText>
              {subtitle !== null && (
                <AppText variant="caption" color="muted" numberOfLines={1}>
                  {subtitle}
                </AppText>
              )}
            </View>
          ),
          headerRight: () => (
            <HeaderActions>
              {conversation.data.kind !== "business" && (
                <HeaderButton
                  icon="videocam-outline"
                  label="Görüntülü görüşme başlat"
                  onPress={() => void startVideoCall(id)}
                />
              )}
              {conversation.data.kind === "business" && (
                <HeaderButton
                  icon="receipt-outline"
                  label="Siparişlerimi paylaş"
                  onPress={() => {
                    router.push({ pathname: "/chat/[id]/orders", params: { id } });
                  }}
                />
              )}
              <HeaderButton
                icon="ellipsis-horizontal"
                label="Sohbet bilgisi"
                onPress={() => {
                  router.push({ pathname: "/chat/[id]/info", params: { id } });
                }}
                testID="chat-info"
              />
            </HeaderActions>
          ),
        }}
      />

      <FlatList
        inverted
        data={items}
        keyExtractor={(item) => item.key}
        renderItem={renderItem}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (messages.hasNextPage && !messages.isFetchingNextPage) void messages.fetchNextPage();
        }}
        ListFooterComponent={
          messages.isFetchingNextPage ? <ActivityIndicator color={colors.teal} /> : null
        }
        ListEmptyComponent={
          // Liste ters çevrildiği için boş durum metni de ters çevrilerek düz gösterilir.
          <View style={styles.emptyFlip}>
            <ChatNote text="Henüz mesaj yok. İlk mesajı sen yaz." />
          </View>
        }
      />
      <Composer conversationId={id} allowImages={conversation.data.kind !== "business"} />
      <ImageViewer
        imageUrl={viewedImage}
        onClose={() => {
          setViewedImage(null);
        }}
      />
      <ReportSheet
        target={reportedId === null ? null : { type: "message", id: reportedId }}
        onClose={() => {
          setReportedId(null);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.mist,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingVertical: space.sm,
  },
  emptyFlip: {
    transform: [{ scaleY: -1 }],
  },
});
