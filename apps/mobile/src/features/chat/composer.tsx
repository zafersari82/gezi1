import { MESSAGE_MAX_LENGTH, TYPING_THROTTLE_MS } from "@vado/contracts";
import { router } from "expo-router";
import { useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputContentSizeChangeEvent,
  type TextInputKeyPressEvent,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { pickImages } from "@/features/media/pick-images";
import { useRealtime } from "@/features/realtime/realtime-provider";
import { colors, radius, space, TOUCH_TARGET, typography } from "@/theme/tokens";
import { HeaderButton } from "@/ui/header-button";
import { Icon } from "@/ui/icon";

import { sendImage, sendText } from "./queries";

/**
 * Klavyeli kullanımda (web) Enter mesajı gönderir, Shift+Enter yeni satır açar.
 * Telefonda satır başı tuşu her zaman yeni satır açar; gönderim düğmeyle yapılır.
 */
function isPlainEnterOnWeb(event: TextInputKeyPressEvent): boolean {
  if (Platform.OS !== "web") return false;
  // Tarayıcı olayında bulunan Shift bilgisi React Native tipinde tanımlı değildir.
  const press: TextInputKeyPressEvent["nativeEvent"] & { shiftKey?: boolean } = event.nativeEvent;
  return press.key === "Enter" && press.shiftKey !== true;
}

/** Sohbetin altındaki mesaj yazma alanı. */
export function Composer({
  conversationId,
  allowImages = true,
}: {
  conversationId: string;
  allowImages?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { sendTyping } = useRealtime();
  const [text, setText] = useState("");
  const [webHeight, setWebHeight] = useState<number | null>(null);
  const lastTypingAt = useRef(0);
  const canSend = text.trim() !== "";

  function changeText(value: string) {
    setText(value);
    if (value === "") setWebHeight(null);
    // "Yazıyor" bildirimi her tuşta değil, belirli aralıklarla gönderilir.
    const now = Date.now();
    if (value !== "" && now - lastTypingAt.current > TYPING_THROTTLE_MS) {
      lastTypingAt.current = now;
      sendTyping(conversationId);
    }
  }

  function send() {
    if (!canSend) return;
    sendText(conversationId, text.trim());
    setText("");
    setWebHeight(null);
    lastTypingAt.current = 0;
  }

  // Telefonda çok satırlı giriş içeriğe göre kendiliğinden büyür. Web'de büyümediği için
  // yükseklik içerikten okunur; giriş boşalınca tek satıra döner.
  function growOnWeb(event: TextInputContentSizeChangeEvent) {
    setWebHeight(event.nativeEvent.contentSize.height);
  }

  async function attachImage() {
    const [image] = await pickImages(1);
    if (image !== undefined) sendImage(conversationId, image);
  }

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.sm) }]}>
      <HeaderButton
        icon="share-social-outline"
        label="İşletme veya mini uygulama paylaş"
        color="muted"
        onPress={() => {
          router.push({ pathname: "/chat/[id]/share", params: { id: conversationId } });
        }}
        testID="share-target"
      />
      {allowImages && (
        <HeaderButton
          icon="image-outline"
          label="Fotoğraf gönder"
          color="muted"
          onPress={() => void attachImage()}
        />
      )}
      <TextInput
        value={text}
        onChangeText={changeText}
        placeholder="Mesaj yaz"
        placeholderTextColor={colors.faint}
        accessibilityLabel="Mesaj yaz"
        multiline
        maxLength={MESSAGE_MAX_LENGTH}
        style={[styles.input, webHeight !== null && { height: webHeight }]}
        {...(Platform.OS === "web" ? { rows: 1, onContentSizeChange: growOnWeb } : {})}
        onKeyPress={(event) => {
          if (isPlainEnterOnWeb(event)) {
            event.preventDefault();
            send();
          }
        }}
        testID="message-input"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Gönder"
        accessibilityState={{ disabled: !canSend }}
        disabled={!canSend}
        onPress={send}
        style={[styles.send, !canSend && styles.sendDisabled]}
        testID="send-message"
      >
        <Icon name="arrow-up" size={20} color="white" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space.sm,
    paddingTop: space.sm,
    paddingHorizontal: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  input: {
    flex: 1,
    minHeight: TOUCH_TARGET - 8,
    maxHeight: 120,
    paddingHorizontal: space.md + 2,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    borderRadius: radius.xl,
    backgroundColor: colors.mist,
    ...typography.body,
    color: colors.ink,
    outlineWidth: 0,
  },
  send: {
    width: TOUCH_TARGET - 8,
    height: TOUCH_TARGET - 8,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.teal,
  },
  sendDisabled: {
    backgroundColor: colors.line,
  },
});
