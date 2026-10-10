import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { Pressable, StyleSheet, View } from "react-native";

import { openSharedTarget } from "@/features/sharing/open-target";
import { SharedPreviewCard } from "@/features/sharing/shared-preview-card";
import {
  MESSAGE_LINK_PATTERN,
  parseSharedTarget,
  sharedPreviewTarget,
} from "@/features/sharing/shared-target";
import { colors, radius, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";

const IMAGE_SIZE = 220;

interface MessageBubbleProps {
  body: string;
  /** Fotoğraf mesajında görselin adresi (gönderilmekte olan mesajda cihazdaki adresi). */
  imageUrl: string | null;
  mine: boolean;
  /** Grup sohbetinde başkasının mesajının üstünde gösterilen ad. */
  senderName?: string | null;
  /** Gönderimi süren mesaj soluk çizilir. */
  pending?: boolean;
  /** Balonun altındaki küçük not: "Okundu", "İletildi" veya gönderim hatası. */
  footnote?: string | null;
  footnoteTone?: "muted" | "coral";
  onPress?: () => void;
  /** Basılı tutulduğunda yapılacak iş (başkasının mesajında şikayet penceresi). */
  onLongPress?: () => void;
}

/** Metindeki bağlantıları dokunulabilir yapar. */
function LinkedText({ text, mine }: { text: string; mine: boolean }) {
  const color = mine ? "white" : "ink";
  return (
    <AppText color={color}>
      {text.split(MESSAGE_LINK_PATTERN).map((part, index) => {
        if (index % 2 === 0) return part;
        const target = parseSharedTarget(part);
        if (part.startsWith("vado:") && target === null) return part;
        return (
          <AppText
            key={`${index}-${part}`}
            color={color}
            style={styles.link}
            accessibilityRole="link"
            onPress={() => {
              if (target !== null) {
                openSharedTarget(target);
              } else {
                void Linking.openURL(part);
              }
            }}
          >
            {part}
          </AppText>
        );
      })}
    </AppText>
  );
}

export function MessageBubble({
  body,
  imageUrl,
  mine,
  senderName,
  pending = false,
  footnote,
  footnoteTone = "muted",
  onPress,
  onLongPress,
}: MessageBubbleProps) {
  const hasFootnote = footnote !== undefined && footnote !== null;
  const previewTarget =
    imageUrl === null && !pending && onPress === undefined ? sharedPreviewTarget(body) : null;

  return (
    <View style={[styles.row, mine ? styles.rowMine : styles.rowTheirs]}>
      {senderName !== undefined && senderName !== null && (
        <AppText variant="caption" color="muted" style={styles.sender}>
          {senderName}
        </AppText>
      )}
      {previewTarget !== null ? (
        <SharedPreviewCard target={previewTarget} onLongPress={onLongPress} />
      ) : (
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          disabled={onPress === undefined && onLongPress === undefined}
          accessibilityHint={
            onLongPress === undefined ? undefined : "Şikayet etmek için basılı tut"
          }
          style={[
            imageUrl === null ? styles.bubble : styles.imageBubble,
            imageUrl === null && (mine ? styles.bubbleMine : styles.bubbleTheirs),
            pending && styles.pending,
          ]}
        >
          {imageUrl === null ? (
            <LinkedText text={body} mine={mine} />
          ) : (
            <Image
              source={{ uri: imageUrl }}
              style={styles.image}
              contentFit="cover"
              accessibilityLabel="Fotoğraf"
            />
          )}
        </Pressable>
      )}
      {hasFootnote && (
        <AppText variant="caption" color={footnoteTone} style={styles.footnote}>
          {footnote}
        </AppText>
      )}
    </View>
  );
}

/** Sohbetin ortasında gösterilen sistem mesajı ve zaman ayracı. */
export function ChatNote({ text }: { text: string }) {
  return (
    <AppText variant="caption" color="muted" align="center" style={styles.note}>
      {text}
    </AppText>
  );
}

const styles = StyleSheet.create({
  row: {
    maxWidth: "82%",
    marginVertical: 2,
    marginHorizontal: space.md,
  },
  rowMine: {
    alignSelf: "flex-end",
    alignItems: "flex-end",
  },
  rowTheirs: {
    alignSelf: "flex-start",
    alignItems: "flex-start",
  },
  sender: {
    marginTop: space.sm,
    marginBottom: 2,
    marginLeft: space.md,
  },
  bubble: {
    paddingHorizontal: space.md + 2,
    paddingVertical: space.sm + 1,
    borderRadius: 18,
  },
  bubbleMine: {
    backgroundColor: colors.teal,
    borderBottomRightRadius: 6,
  },
  bubbleTheirs: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 6,
  },
  imageBubble: {
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  image: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
    backgroundColor: colors.line,
  },
  pending: {
    opacity: 0.55,
  },
  link: {
    textDecorationLine: "underline",
  },
  footnote: {
    marginTop: 2,
    marginHorizontal: space.xs,
  },
  note: {
    marginVertical: space.md,
    marginHorizontal: space.xl,
  },
});
