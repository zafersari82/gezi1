import {
  BRIDGE_PROTOCOL_VERSION,
  businessContextBodySchema,
  type MiniAppDetail,
  type Payment,
} from "@vado/contracts";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Modal, Share, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/api/client";
import { APP_VERSION } from "@/api/config";
import { PaymentSheet } from "@/features/payments/payment-sheet";
import { createPayment } from "@/features/payments/queries";
import { QrScanner } from "@/features/qr/qr-scanner";
import { useRealtime } from "@/features/realtime/realtime-provider";
import { ReportSheet } from "@/features/reports/report-sheet";
import { useMe } from "@/features/session/session-provider";
import { currentPlatform } from "@/lib/platform";
import { usePrompt } from "@/lib/use-prompt";
import { colors, radius, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Tag } from "@/ui/badge";
import { Button } from "@/ui/button";
import { HeaderButton } from "@/ui/header-button";
import { Icon } from "@/ui/icon";

import { type BridgeHost, handleBridgeMessage } from "./bridge";
import { type ConsentRequest, ConsentSheet } from "./consent-sheet";
import { consentStatusOf, grantConsent, miniAppStorage } from "./consents";
import { createFeedbackHost } from "./feedback-host";
import { createIncentivesHost } from "./incentives-host";
import type { LaunchOrigin } from "./launch-params";
import { createLocationHost } from "./location-host";
import { MiniAppFrame } from "./mini-app-frame";
import type { MiniAppFrameHandle } from "./mini-app-frame.types";
import { MiniAppIcon } from "./mini-app-icon";
import { createOrderingHost } from "./ordering-host";
import { fetchMiniAppIdentity, fetchMiniAppIdentityToken } from "./queries";
import { createReturnsHost } from "./returns-host";

/** "Yaklaşık konum" yetkisi: koordinatlar yaklaşık 100 metre duyarlılığa yuvarlanır. */
const COARSE_PRECISION = 1000;
const coarse = (value: number) => Math.round(value * COARSE_PRECISION) / COARSE_PRECISION;

/** İptal edilmiş ya da süresi dolmuş bir sipariş numarası yeniden ödenemez. */
const CLOSED_PAYMENT_MESSAGE =
  "Bu siparişin ödemesi iptal edilmiş ya da süresi dolmuş. Siparişi yeniden oluştur.";

/**
 * Mini uygulamanın içinde çalıştığı kabuk: üst çubuk, mini uygulama penceresi ve köprünün
 * kullanıcıya gösterdiği pencereler (izin onayı, ödeme onayı, QR okutma).
 */
export function MiniAppHost({
  miniApp,
  launchParams,
  launchQr = null,
  launchOrigin = null,
}: {
  miniApp: MiniAppDetail;
  launchParams: Record<string, string>;
  launchQr?: string | null;
  launchOrigin?: LaunchOrigin | null;
}) {
  const me = useMe();
  const insets = useSafeAreaInsets();
  const frame = useRef<MiniAppFrameHandle>(null);
  const consent = usePrompt<ConsentRequest, boolean>(false);
  const payment = usePrompt<Payment, boolean>(false);
  const scanner = usePrompt<true, string | null>(null);
  const [reporting, setReporting] = useState(false);
  const realtime = useRealtime();
  useEffect(() => {
    if (!miniApp.capabilities.includes("ordering.basic")) return;
    return realtime.subscribeOrdering((connected) =>
      frame.current?.post(
        JSON.stringify({
          vado: BRIDGE_PROTOCOL_VERSION,
          type: "event",
          name: connected === null ? "ordering.changed" : "ordering.connection",
          ...(connected === null ? {} : { connected }),
        }),
      ),
    );
  }, [realtime, miniApp.capabilities]);
  const context = businessContextBodySchema.safeParse({
    businessId: launchParams.businessId,
    appInstanceId: launchParams.appInstanceId,
    miniAppId: miniApp.id,
  });

  // Tüm kabuk servisleri aynı kimlik doğrulamalı HTTP taşıyıcısını kullanır.
  // Mini uygulama yalnız yöntem ve alan seçebilir; URL ve oturum bağlamını seçemez.
  const transport = {
    request: (method: "GET" | "POST" | "PUT", path: string, body?: unknown, key?: string) =>
      method === "GET"
        ? api.get<unknown>(path)
        : method === "PUT"
          ? key === undefined
            ? api.put<unknown>(path, body)
            : api.putIdempotent<unknown>(path, key, body)
          : key === undefined
            ? api.post<unknown>(path, body)
            : api.postIdempotent<unknown>(path, key, body),
  };
  const selected = context.success
    ? { ...context.data, miniAppId: miniApp.id }
    : { miniAppId: miniApp.id };
  const commerceHost = createOrderingHost(selected, transport, launchQr);
  const host: BridgeHost = {
    location: createLocationHost(transport),
    incentives: createIncentivesHost(selected, transport),
    feedback: createFeedbackHost(selected, transport),
    returns: createReturnsHost(selected, transport),
    ordering: commerceHost,
    tableService: commerceHost,
    miniApp,
    launchParams,
    containerInfo: () => ({
      platform: currentPlatform(),
      appVersion: APP_VERSION,
      locale: "tr-TR",
      protocolVersion: BRIDGE_PROTOCOL_VERSION,
    }),
    close: () => {
      router.back();
    },
    hasConsent: async (capability) =>
      (await consentStatusOf(me.id, miniApp, capability)) === "granted",
    async askConsent(capability) {
      // Mini uygulama izin verildiğinden beri değiştiyse izin yeniden sorulur ve nedeni söylenir.
      const status = await consentStatusOf(me.id, miniApp, capability);
      const granted = await consent.ask({ capability, updated: status === "outdated" });
      if (granted) await grantConsent(me.id, miniApp, capability);
      return granted;
    },
    getIdentity: () => fetchMiniAppIdentity(miniApp.id),
    getIdentityToken: () => fetchMiniAppIdentityToken(miniApp.id),
    scanQr: () => scanner.ask(true),
    async getLocation() {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) return null;
      const { coords } = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      return {
        latitude: coarse(coords.latitude),
        longitude: coarse(coords.longitude),
        accuracyMeters: coords.accuracy,
      };
    },
    async requestPayment(params) {
      // Mini uygulama kimliğini kabuk ekler; mini uygulama başkası adına ödeme isteyemez.
      const created = await createPayment({ miniAppId: miniApp.id, ...params });
      if (created.status === "paid") return created.id;
      // Aynı sipariş numarasıyla açılmış eski oturum kapanmışsa onay ekranı açılmaz.
      if (created.status !== "created") throw new Error(CLOSED_PAYMENT_MESSAGE);
      const paid = await payment.ask(created);
      if (!paid) {
        await api.post(`/v1/payments/${created.id}/cancel`).catch(() => undefined);
        return null;
      }
      return created.id;
    },
    storage: miniAppStorage(me.id, miniApp.id),
    async share({ title, text, url }) {
      const message = [text, url].filter((part) => part !== undefined).join(" ");
      await Share.share({ title, message: message === "" ? title : message });
    },
  };

  async function onMessage(message: string) {
    const response = await handleBridgeMessage(message, host);
    if (response !== null) frame.current?.post(JSON.stringify(response));
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.bar, { paddingTop: insets.top + space.xs }]}>
        <MiniAppIcon miniApp={miniApp} size={28} />
        <View style={styles.title}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {miniApp.name}
          </AppText>
          {miniApp.verified && <Icon name="checkmark-circle" size={16} color="teal" />}
          {miniApp.source === "url" && <Tag label="Geliştirme" tone="warning" />}
        </View>
        <View style={styles.capsule}>
          <HeaderButton
            icon="share-social-outline"
            label="Mini uygulamayı paylaş veya QR göster"
            color="ink"
            onPress={() => {
              router.push({
                pathname: "/share-target",
                params: { kind: "miniapp", id: miniApp.id },
              });
            }}
          />
          <HeaderButton
            icon="flag-outline"
            label="Şikayet et"
            color="ink"
            onPress={() => {
              setReporting(true);
            }}
          />
          <HeaderButton
            icon="refresh"
            label="Yeniden yükle"
            color="ink"
            onPress={() => frame.current?.reload()}
          />
          <HeaderButton
            icon="close"
            label={launchOrigin?.type === "business" ? "Mağazaya dön" : "Mini uygulamayı kapat"}
            color="ink"
            onPress={() => {
              router.back();
            }}
            testID="close-miniapp"
          />
        </View>
      </View>

      <MiniAppFrame
        ref={frame}
        miniApp={miniApp}
        onMessage={(message) => void onMessage(message)}
      />

      <ConsentSheet miniAppName={miniApp.name} request={consent.input} onAnswer={consent.answer} />
      <PaymentSheet
        payment={payment.input}
        onPaid={() => {
          payment.answer(true);
        }}
        onCancel={() => {
          payment.answer(false);
        }}
      />
      <Modal
        visible={scanner.input !== null}
        animationType="slide"
        onRequestClose={() => {
          scanner.answer(null);
        }}
      >
        <View style={[styles.scanner, { paddingBottom: insets.bottom + space.lg }]}>
          <QrScanner onScanned={scanner.answer} />
          <View style={styles.scannerActions}>
            <Button
              label="Vazgeç"
              variant="secondary"
              onPress={() => {
                scanner.answer(null);
              }}
            />
          </View>
        </View>
      </Modal>
      <ReportSheet
        target={reporting ? { type: "miniapp", id: miniApp.id } : null}
        onClose={() => {
          setReporting(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingBottom: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  title: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
  },
  capsule: {
    flexDirection: "row",
    paddingHorizontal: space.xs,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.pill,
  },
  scanner: {
    flex: 1,
    backgroundColor: colors.black,
  },
  scannerActions: {
    paddingTop: space.lg,
    paddingHorizontal: space.xl,
  },
});
