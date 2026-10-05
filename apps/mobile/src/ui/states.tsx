import { ActivityIndicator, StyleSheet, View } from "react-native";

import { errorMessage } from "@/api/client";
import { colors, space } from "@/theme/tokens";

import { AppText } from "./app-text";
import { Button } from "./button";
import { Icon, type IconName } from "./icon";

/** Veri yüklenirken ekranın ortasında gösterilen bekleme göstergesi. */
export function LoadingView() {
  return (
    <View style={styles.center} accessibilityLabel="Yükleniyor">
      <ActivityIndicator color={colors.teal} />
    </View>
  );
}

interface ErrorViewProps {
  error: unknown;
  onRetry?: () => void;
}

/** Veri alınamadığında ne olduğunu söyler ve yeniden denemeyi önerir. */
export function ErrorView({ error, onRetry }: ErrorViewProps) {
  return (
    <View style={styles.center}>
      <AppText color="muted" align="center">
        {errorMessage(error)}
      </AppText>
      {onRetry !== undefined && (
        <Button label="Tekrar dene" variant="secondary" size="small" onPress={onRetry} />
      )}
    </View>
  );
}

interface EmptyStateProps {
  icon: IconName;
  title: string;
  /** Kullanıcıya bir sonraki adımı söyleyen kısa açıklama. */
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

/** Boş liste: neyin eksik olduğunu ve nasıl doldurulacağını anlatır. */
export function EmptyState({ icon, title, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.center}>
      <Icon name={icon} size={40} color="faint" />
      <View style={styles.texts}>
        <AppText variant="subheading" align="center">
          {title}
        </AppText>
        <AppText color="muted" align="center">
          {message}
        </AppText>
      </View>
      {actionLabel !== undefined && onAction !== undefined && (
        <Button label={actionLabel} size="small" onPress={onAction} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.lg,
    padding: space.xxl,
  },
  texts: {
    gap: space.xs,
    maxWidth: 300,
  },
});
