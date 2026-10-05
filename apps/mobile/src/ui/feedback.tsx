import { createContext, type ReactNode, use, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors, radius, space } from "@/theme/tokens";

import { AppText } from "./app-text";
import { Button } from "./button";
import { Sheet } from "./sheet";

const NOTICE_DURATION_MS = 3200;

interface ConfirmOptions {
  title: string;
  message?: string;
  /** Onay düğmesi yapılacak işi adıyla söyler: "Sil", "Gruptan ayrıl" gibi. */
  confirmLabel: string;
  /** Geri alınamayan işlemlerde onay düğmesi dikkat rengiyle gösterilir. */
  destructive?: boolean;
}

interface FeedbackContextValue {
  /** Kullanıcıdan onay ister; onaylarsa `true` döner. */
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  /** Ekranın üstünde kısa süreli bilgi iletisi gösterir. */
  notify: (message: string) => void;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

interface PendingConfirm extends ConfirmOptions {
  resolve: (confirmed: boolean) => void;
}

interface Notice {
  id: number;
  message: string;
}

/**
 * Onay pencereleri ve kısa bildirimler. İşletim sisteminin uyarı penceresi web'de
 * çalışmadığı için her platformda aynı görünen kendi bileşenlerimiz kullanılır.
 */
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => {
    if (notice === null) return;
    const timer = setTimeout(() => {
      setNotice(null);
    }, NOTICE_DURATION_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [notice]);

  const value: FeedbackContextValue = {
    confirm: (options) =>
      new Promise((resolve) => {
        setPending({ ...options, resolve });
      }),
    notify: (message) => {
      setNotice({ id: Date.now(), message });
    },
  };

  function answer(confirmed: boolean) {
    pending?.resolve(confirmed);
    setPending(null);
  }

  return (
    <FeedbackContext value={value}>
      {children}

      {notice !== null && (
        <View style={[styles.noticeLayer, { top: insets.top + space.sm }]}>
          <View style={styles.notice} accessibilityLiveRegion="polite" accessibilityRole="alert">
            <AppText variant="callout" color="white">
              {notice.message}
            </AppText>
          </View>
        </View>
      )}

      <Sheet
        visible={pending !== null}
        title={pending?.title}
        onClose={() => {
          answer(false);
        }}
      >
        {pending?.message !== undefined && <AppText color="muted">{pending.message}</AppText>}
        <View style={styles.actions}>
          <Button
            label={pending?.confirmLabel ?? ""}
            variant={pending?.destructive === true ? "danger" : "primary"}
            onPress={() => {
              answer(true);
            }}
            testID="confirm-accept"
          />
          <Button
            label="Vazgeç"
            variant="ghost"
            onPress={() => {
              answer(false);
            }}
          />
        </View>
      </Sheet>
    </FeedbackContext>
  );
}

export function useFeedback(): FeedbackContextValue {
  const context = use(FeedbackContext);
  if (context === null) throw new Error("useFeedback, FeedbackProvider içinde kullanılmalıdır");
  return context;
}

const styles = StyleSheet.create({
  noticeLayer: {
    position: "absolute",
    left: space.lg,
    right: space.lg,
    alignItems: "center",
    zIndex: 100,
    pointerEvents: "none",
  },
  notice: {
    maxWidth: 480,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.ink,
  },
  actions: {
    gap: space.sm,
  },
});
