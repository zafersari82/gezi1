import { isInScope } from "@vado/contracts";
import { useImperativeHandle, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { WebView } from "react-native-webview";

import { colors } from "@/theme/tokens";
import { EmptyState, LoadingView } from "@/ui/states";

import { isLeftNotice } from "./bridge";
import { LeftState } from "./left-state";
import type { MiniAppFrameProps } from "./mini-app-frame.types";
import { hasLeftScope, isBridgeSender, mainDocumentScope } from "./navigation";

/**
 * WebView kitaplığı, izin listesinde olmayan bir adresi işletim sistemine açtırır (tarayıcı,
 * telefon ya da başka bir uygulama). Liste her adresi kapsayacak biçimde verilir; böylece bütün
 * gezinmeler aşağıdaki kapsam denetimine düşer ve kapsam dışındaki adres hiçbir yerde açılmaz.
 */
const EVERY_ORIGIN = ["*"];
const HTTP_ERROR = 400;

/**
 * Mini uygulamayı yalıtılmış bir web görünümünde çalıştırır.
 *
 * Mini uygulama güvenilmeyen içerik sayılır. Paketle yayınlanan kayıtta görünümün ana sayfası
 * VADO'nun sarmalayıcı belgesidir; paket onun içindeki korumalı çerçevede çalışır ve köprüyle
 * onun üzerinden konuşur. Paketin başka bir adrese gitmesini önce tarayıcı motoru engeller
 * (sarmalayıcının çerçeve kısıtı, çerçevenin kum havuzu); kabuk bunun üzerine kendi sınırlarını
 * ekler:
 *
 * - Gezinme kilidi: görünümde yalnızca kaydın adres kapsamındaki sayfalar yüklenebilir. Kapsam
 *   dışındaki bağlantı açılmaz, sistem tarayıcısına ya da başka uygulamaya da devredilmez.
 *   iOS'ta kilit her çerçevenin gezinmesini, Android'de yalnızca ana sayfanınkini görür.
 * - Kilit aşılırsa: ana sayfa olarak başka bir sayfa yüklenmeye başlarsa görünüm kaldırılır; o
 *   sayfa ne gösterilir ne de köprüye ulaşır.
 * - Köprü iletisi yalnızca mini uygulamanın kendi sayfasından geldiyse işlenir (paketle
 *   yayınlanan kayıtta: sarmalayıcı belgeden).
 * - Sarmalayıcı, paketin açıldığı belgeden ayrılmaya çalıştığını bildirirse görünüm kaldırılır.
 * - Yeni pencere açılamaz; dosya sistemine, kabuğun çerezlerine, konuma, kameraya ve mikrofona
 *   erişilemez. Bunlara ihtiyaç duyan mini uygulama köprüden ister, kullanıcıya kabuk sorar.
 *
 * Web önizlemesinin karşılığı `mini-app-frame.web.tsx` dosyasındadır.
 */
export function MiniAppFrame({ miniApp, onMessage, ref }: MiniAppFrameProps) {
  const webView = useRef<WebView>(null);
  const [failed, setFailed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [left, setLeft] = useState(false);
  const { entryUrl, scope } = miniApp;

  useImperativeHandle(ref, () => ({
    post(message) {
      // Yanıt, ana sayfaya bir "message" olayı olarak teslim edilir. Paketle yayınlanan kayıtta
      // onu sarmalayıcı belge alıp paketin çerçevesine aktarır; geliştirme sayfasında SDK dinler.
      const script = `window.dispatchEvent(new MessageEvent("message", { data: ${JSON.stringify(message)} })); true;`;
      webView.current?.injectJavaScript(script);
    },
    reload() {
      setFailed(false);
      setLeft(false);
      setRetryCount((count) => count + 1);
    },
  }));

  if (left) {
    return (
      <LeftState
        onReopen={() => {
          setLeft(false);
        }}
      />
    );
  }

  if (failed) {
    return (
      <EmptyState
        icon="cloud-offline-outline"
        title="Mini uygulama açılamadı"
        message="Bağlantını kontrol edip yeniden dene."
        actionLabel="Yeniden dene"
        onAction={() => {
          setFailed(false);
          setRetryCount((count) => count + 1);
        }}
      />
    );
  }

  return (
    <WebView
      key={`${entryUrl}:${retryCount}`}
      ref={webView}
      source={{ uri: entryUrl }}
      style={styles.frame}
      originWhitelist={EVERY_ORIGIN}
      onShouldStartLoadWithRequest={(request) => isInScope(request.url, scope)}
      onLoadStart={(event) => {
        if (hasLeftScope(event.nativeEvent.url, mainDocumentScope(miniApp))) setLeft(true);
      }}
      onMessage={(event) => {
        const { url, data } = event.nativeEvent;
        if (!isBridgeSender(url, miniApp)) return;
        if (isLeftNotice(data)) setLeft(true);
        else onMessage(data);
      }}
      onError={() => {
        setFailed(true);
      }}
      onHttpError={(event) => {
        const { statusCode, url } = event.nativeEvent;
        if (statusCode >= HTTP_ERROR && url === entryUrl) setFailed(true);
      }}
      javaScriptCanOpenWindowsAutomatically={false}
      setSupportMultipleWindows={false}
      sharedCookiesEnabled={false}
      thirdPartyCookiesEnabled={false}
      // Paketler tarayıcı deposunu kullanamaz; veri köprüdeki depolamada durur. Geliştirme
      // sunucusundan açılan kayıtlarda geliştirme araçları için açık bırakılır.
      domStorageEnabled={miniApp.source === "url"}
      geolocationEnabled={false}
      mediaCapturePermissionGrantType="deny"
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      allowsLinkPreview={false}
      allowsBackForwardNavigationGestures={false}
      mixedContentMode="never"
      webviewDebuggingEnabled={__DEV__}
      startInLoadingState
      renderLoading={() => (
        <View style={StyleSheet.absoluteFill}>
          <LoadingView />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    backgroundColor: colors.surface,
  },
});
