import type { Conversation } from "@vado/contracts";
import { StyleSheet, View } from "react-native";

import { formatListTime } from "@/lib/format";
import { space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Avatar } from "@/ui/avatar";
import { CountBadge } from "@/ui/badge";
import { ListRow } from "@/ui/list-row";

import { useTypingUserIds } from "./typing";

/** Sohbet listesinde son mesajın tek satırlık özeti. */
function previewOf(conversation: Conversation, myId: string): string {
  const last = conversation.lastMessage;
  if (last === null) return "";
  const text = last.kind === "image" ? "Fotoğraf" : last.body;
  if (last.kind === "system") return text;
  if (last.senderId === myId) return `Sen: ${text}`;
  if (conversation.kind === "group" && last.senderName !== null) {
    return `${last.senderName.split(" ")[0] ?? last.senderName}: ${text}`;
  }
  return text;
}

interface ConversationRowProps {
  conversation: Conversation;
  myId: string;
  onPress: () => void;
}

export function ConversationRow({ conversation, myId, onPress }: ConversationRowProps) {
  const typing = useTypingUserIds(conversation.id).length > 0;

  return (
    <ListRow
      title={conversation.title}
      subtitle={typing ? "yazıyor…" : previewOf(conversation, myId)}
      leading={
        <Avatar
          name={conversation.title}
          imageUrl={conversation.avatarUrl}
          size={52}
          group={conversation.kind === "group"}
        />
      }
      trailing={
        <View style={styles.meta}>
          <AppText variant="caption" color={conversation.unreadCount > 0 ? "coral" : "muted"}>
            {formatListTime(conversation.updatedAt)}
          </AppText>
          <CountBadge count={conversation.unreadCount} />
        </View>
      }
      onPress={onPress}
      testID={`conversation-${conversation.id}`}
    />
  );
}

const styles = StyleSheet.create({
  meta: {
    alignItems: "flex-end",
    gap: space.xs,
    minHeight: 40,
  },
});
