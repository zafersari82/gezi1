import { bridgeConnectSchema } from "@vado/contracts";
import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState } from "react";

import { isLeftNotice } from "./bridge";
import { LeftState } from "./left-state";
import type { MiniAppFrameProps } from "./mini-app-frame.types";
import { isBridgeSender } from "./navigation";

/**
 * Çerçevedeki sayfa kendi kaynağında kalır; yeni pencere açamaz, kabuğun sayfasını başka adrese
 * götüremez. Paketle yayınlanan kayıtta bu sayfa VADO'nun sarmalayıcı belgesidir: paketi kendi
 * içinde, kimliksiz bir kaynakta çalışan ayrı bir çerçevede açar. Geliştirme sunucusu için de
 * aynı ayar geçerlidir; geliştirme araçları sayfanın kendi kaynağında çalışmasını gerektirir.
 */
const FRAME_SANDBOX = "allow-scripts allow-forms allow-same-origin";

/**
 * Web önizlemesinde mini uygulama korumalı bir çerçevede (iframe) çalışır.
 *
 * Köprü pencere iletileriyle değil, çerçevedeki sayfanın ilk iletisinde kabuğa verdiği ileti
 * kapısıyla (MessagePort) kurulur: kapı yalnızca kabuğun açtığı çerçeveden ve beklenen kaynaktan
 * gelirse kabul edilir, yanıtlar yalnızca o kapıya gider. Paketle yayınlanan kayıtta kapıyı
 * sarmalayıcı belge verir ve paketin isteklerini o aktarır.
 *
 * Paketin başka bir adrese gitmesini sarmalayıcının çerçeve kısıtı engeller; sarmalayıcı böyle
 * bir girişimi bildirdiğinde çerçeve kaldırılır. Sarmalayıcı kapısını yalnızca bir kez verir:
 * çerçeveden ikinci bir kapı gelirse içindeki sayfa artık o değildir ve çerçeve yine kaldırılır.
 *
 * Çerçevenin "yüklendi" olayına güvenilmez: tarayıcılar bu olayı, sayfa değişmeden yapılan
 * geçmiş gezinmelerinde de (geri tuşu, adresin `#` sonrası) gönderir.
 */
export function MiniAppFrame({ miniApp, onMessage, ref }: MiniAppFrameProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const port = useRef<MessagePort | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [left, setLeft] = useState(false);
  const isPackage = miniApp.source === "package";
  // Çerçevenin bir "oturumu": adres değişince (yeni sürüm yayınlandı) ya da kullanıcı yeniden
  // yükleyince çerçeve baştan kurulur.
  const session = `${miniApp.entryUrl}#${reloadCount}`;

  function disconnect() {
    port.current?.close();
    port.current = null;
  }

  function restart() {
    setLeft(false);
    setReloadCount((count) => count + 1);
  }

  useImperativeHandle(ref, () => ({
    post(message) {
      port.current?.postMessage(message);
    },
    reload: restart,
  }));

  // Oturum biterken eski sayfanın kapısı kapatılır; yeni çerçeve kendi kapısını verir.
  useEffect(
    () => () => {
      disconnect();
    },
    [session],
  );

  const receive = useEffectEvent((data: unknown) => {
    if (typeof data !== "string") return;
    if (isLeftNotice(data)) {
      disconnect();
      setLeft(true);
    } else {
      onMessage(data);
    }
  });

  const connect = useEffectEvent((event: MessageEvent) => {
    if (event.source !== frame.current?.contentWindow) return;
    if (!bridgeConnectSchema.safeParse(event.data).success) return;
    const [offered] = event.ports;
    if (offered === undefined || !isBridgeSender(event.origin, miniApp)) return;

    const replaced = port.current !== null;
    disconnect();
    // Geliştirme sunucusu kod değiştikçe sayfayı yeniler; yeni sayfa kapısını yeniden verir.
    // Sarmalayıcı belge ise hiç yeniden yüklenmez: ikinci kapıyı veren artık o olmayabilir.
    if (replaced && isPackage) {
      setLeft(true);
      return;
    }
    port.current = offered;
    offered.onmessage = (message) => {
      receive(message.data);
    };
  });

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      connect(event);
    };
    window.addEventListener("message", listener);
    return () => {
      window.removeEventListener("message", listener);
    };
  }, []);

  if (left) return <LeftState onReopen={restart} />;

  return (
    <iframe
      key={session}
      ref={frame}
      src={miniApp.entryUrl}
      title={miniApp.name}
      sandbox={FRAME_SANDBOX}
      referrerPolicy="no-referrer"
      style={{ flex: 1, width: "100%", height: "100%", border: 0 }}
    />
  );
}
