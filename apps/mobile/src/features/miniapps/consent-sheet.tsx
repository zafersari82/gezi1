import { CAPABILITY_LABELS, type ConsentCapability } from "@vado/contracts";
import { StyleSheet, View } from "react-native";

import { space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Button } from "@/ui/button";
import { Icon } from "@/ui/icon";
import { Sheet } from "@/ui/sheet";

/** Kullanıcıya sorulan izin. */
export interface ConsentRequest {
  capability: ConsentCapability;
  /** İzin daha önce verilmişti, ama mini uygulama o günden beri değişti. */
  updated: boolean;
}

interface ConsentSheetProps {
  miniAppName: string;
  /** Sorulan izin; `null` iken pencere kapalıdır. */
  request: ConsentRequest | null;
  onAnswer: (granted: boolean) => void;
}

/**
 * Mini uygulama hassas bir yetkiyi ilk kez istediğinde ya da yetkileri ve bağlandığı adresler
 * değiştikten sonra yeniden istediğinde kullanıcıya sorulan onay.
 */
export function ConsentSheet({ miniAppName, request, onAnswer }: ConsentSheetProps) {
  return (
    <Sheet
      visible={request !== null}
      title={`${miniAppName} izin istiyor`}
      onClose={() => {
        onAnswer(false);
      }}
    >
      {request !== null && (
        <View style={styles.capability}>
          <Icon name="shield-checkmark-outline" color="teal" />
          <AppText style={styles.label}>{CAPABILITY_LABELS[request.capability]}</AppText>
        </View>
      )}
      {request?.updated === true && (
        <AppText variant="callout" testID="consent-updated">
          Bu mini uygulama güncellendi: istediği yetkiler ya da bağlandığı adresler değişti. Daha
          önce verdiğin izin bu yüzden yeniden soruluyor.
        </AppText>
      )}
      <AppText variant="callout" color="muted">
        Verdiğin izni Ben sekmesindeki “Mini uygulama izinleri” bölümünden geri alabilirsin.
      </AppText>
      <View style={styles.actions}>
        <Button
          label="İzin ver"
          onPress={() => {
            onAnswer(true);
          }}
          testID="consent-allow"
        />
        <Button
          label="Reddet"
          variant="ghost"
          onPress={() => {
            onAnswer(false);
          }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  capability: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.md,
  },
  label: {
    flex: 1,
  },
  actions: {
    gap: space.sm,
  },
});
