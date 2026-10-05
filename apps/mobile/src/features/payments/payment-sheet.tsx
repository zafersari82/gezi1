import type { Payment } from "@vado/contracts";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { errorMessage } from "@/api/client";
import { useVerification } from "@/features/security/verification-provider";
import { formatMoney } from "@/lib/format";
import { colors, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Tag } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Sheet } from "@/ui/sheet";

import { useConfirmPayment } from "./queries";

interface PaymentSheetProps {
  /** Onaylanacak ödeme; `null` iken pencere kapalıdır. */
  payment: Payment | null;
  onPaid: () => void;
  onCancel: () => void;
}

/**
 * VADO'nun ödeme onay ekranı. Tutar ve satıcı mini uygulamanın değil, sunucunun
 * doğruladığı kayıttan gösterilir; ödeme yalnızca kullanıcı burada onaylarsa tamamlanır.
 */
export function PaymentSheet({ payment, onPaid, onCancel }: PaymentSheetProps) {
  const confirmPayment = useConfirmPayment();
  const { verifying } = useVerification();
  const [error, setError] = useState<string | null>(null);

  function pay(paymentId: string) {
    setError(null);
    confirmPayment.mutate(paymentId, {
      onSuccess: onPaid,
      onError: (cause) => {
        setError(errorMessage(cause));
      },
    });
  }

  return (
    // Kimlik doğrulaması sürerken iki pencere üst üste açılmaz; ödeme penceresi yerini ona bırakır.
    <Sheet visible={payment !== null && !verifying} title="Ödeme onayı" onClose={onCancel}>
      {payment !== null && (
        <>
          <View style={styles.summary}>
            <AppText variant="title" testID="payment-amount">
              {formatMoney(payment.amountMinor)}
            </AppText>
            <AppText variant="bodyStrong">{payment.merchantName}</AppText>
            <AppText color="muted">{payment.description}</AppText>
          </View>

          <View style={styles.source}>
            <AppText variant="caption" color="muted" style={styles.sourceText}>
              {payment.miniAppName} mini uygulaması üzerinden
            </AppText>
            {payment.sandbox && <Tag label="Deneme ödemesi" tone="warning" />}
          </View>
          {payment.sandbox && (
            <AppText variant="caption" color="muted">
              Deneme modunda gerçek para hareketi olmaz.
            </AppText>
          )}

          {error !== null && (
            <AppText variant="callout" color="coral">
              {error}
            </AppText>
          )}
          <View style={styles.actions}>
            <Button
              label={`${formatMoney(payment.amountMinor)} öde`}
              loading={confirmPayment.isPending}
              onPress={() => {
                pay(payment.id);
              }}
              testID="payment-confirm"
            />
            <Button
              label="Vazgeç"
              variant="ghost"
              disabled={confirmPayment.isPending}
              onPress={onCancel}
            />
          </View>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  summary: {
    gap: space.xs,
    paddingBottom: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  source: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  sourceText: {
    flex: 1,
  },
  actions: {
    gap: space.sm,
  },
});
