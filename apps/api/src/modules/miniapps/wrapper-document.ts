/**
 * Sarmalayıcı belge: kabuğun açtığı, VADO'nun kendi yazdığı sayfa. Paket bu sayfanın içindeki
 * korumalı çerçevede çalışır.
 *
 * Neden var: bir sayfanın kendi penceresini başka adrese götürmesini o sayfanın güvenlik
 * politikası engelleyemez; ama onu çerçeveleyen sayfanınki engeller. Sarmalayıcının politikası
 * çerçeveye yalnızca paketin giriş belgesinin yüklenmesine izin verir; tarayıcı, paketin başka
 * bir adrese gitme isteğini daha gönderilmeden reddeder (bkz. `wrapperHeaders`).
 *
 * Belgedeki betik iki iş yapar:
 *
 * - Köprüyü aktarır. Paket, kabukla doğrudan değil sarmalayıcı üzerinden konuşur: ilk iletisinde
 *   bir ileti kapısı (MessagePort) verir, sarmalayıcı o kapıdan geleni kabuğa, kabuktan geleni o
 *   kapıya iletir. Telefonda kabuk, WebView'in ileti kanalıdır ve yanıtları bu pencereye
 *   "message" olayı olarak bırakır (gönderen penceresi olmayan olay); web önizlemesinde kabuk üst
 *   penceredir ve sarmalayıcı ona kendi kapısını verir.
 * - Paket açıldığı belgeden ayrılmaya çalışırsa çerçeveyi kaldırır ve kabuğa bildirir. İki işaret
 *   vardır: tarayıcının çerçeve kısıtı ihlali bildirmesi ve çerçeveden ikinci bir bağlantı isteği
 *   gelmesi (ilk sayfa gitmiş, yerine yenisi yüklenmiş demektir). İlk bağlantıyı kuran sayfadan
 *   başkası köprüye ulaşamaz.
 *
 * Betik tarayıcıya metin olarak gider ve politikada özetiyle tanımlanır; bu yüzden uygulamaya
 * özel hiçbir değer içermez. Değerler belgenin kendisindedir: başlık ve `data-entry` niteliği.
 * Derleyiciden geçmediği için yalın yazılmıştır; davranışı `wrapper-document.test.ts` sınar.
 */
export const WRAPPER_SCRIPT = `(function () {
  "use strict";
  var native = window.ReactNativeWebView;
  var frame = document.createElement("iframe");
  var toShell = null;
  var port = null;
  var closed = false;

  function show(id) {
    document.getElementById(id).hidden = false;
  }

  function toApp(message) {
    if (port !== null && typeof message === "string") port.postMessage(message);
  }

  function close() {
    if (closed) return;
    closed = true;
    if (port !== null) port.close();
    port = null;
    frame.remove();
    show("left");
    toShell('{"vado":1,"type":"left"}');
  }

  if (native) {
    toShell = function (message) {
      native.postMessage(message);
    };
    window.addEventListener("message", function (event) {
      if (event.source === null) toApp(event.data);
    });
  } else if (window.parent !== window) {
    var channel = new MessageChannel();
    channel.port1.onmessage = function (event) {
      toApp(event.data);
    };
    window.parent.postMessage({ vado: 1, type: "connect" }, "*", [channel.port2]);
    toShell = function (message) {
      channel.port1.postMessage(message);
    };
  } else {
    show("alone");
    return;
  }

  window.addEventListener("message", function (event) {
    var data = event.data;
    var offered = event.ports[0];
    if (closed) return;
    if (event.source !== frame.contentWindow || event.origin !== "null") return;
    if (!data || data.vado !== 1 || data.type !== "connect" || !offered) return;
    if (port !== null) return close();
    port = offered;
    port.onmessage = function (message) {
      if (typeof message.data === "string") toShell(message.data);
    };
  });
  document.addEventListener("securitypolicyviolation", function (event) {
    if (event.effectiveDirective === "frame-src") close();
  });

  frame.setAttribute("sandbox", "allow-scripts allow-forms");
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.title = document.title;
  frame.src = document.body.getAttribute("data-entry");
  document.body.appendChild(frame);
})();`;

/**
 * Çerçeve sayfayı doldurur. Kenar boşlukları, telefonun ekran çentiği ve ana ekran çubuğu gibi
 * alanların altında içerik kalmaması içindir; çerçevenin içindeki sayfa bu ölçüleri okuyamaz.
 */
export const WRAPPER_STYLE = [
  "html,body{height:100%;margin:0}",
  "body{box-sizing:border-box;overflow:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}",
  "iframe{display:block;width:100%;height:100%;border:0}",
  "p{margin:0;padding:24px;font:16px/1.5 system-ui,sans-serif;text-align:center;color:#444}",
].join("");

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

export interface WrappedApp {
  /** Uygulama kaydının adı: sayfanın ve çerçevenin başlığı olur. */
  name: string;
  /** Çerçeveye yüklenecek adres: paketin giriş belgesi. */
  entryUrl: string;
}

/** Uygulama kaydının sarmalayıcı belgesini üretir. */
export function renderWrapper({ name, entryUrl }: WrappedApp): string {
  return [
    "<!doctype html>",
    '<html lang="tr">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    `<title>${escapeHtml(name)}</title>`,
    `<style>${WRAPPER_STYLE}</style>`,
    "</head>",
    `<body data-entry="${escapeHtml(entryUrl)}">`,
    '<p id="alone" hidden>Bu sayfa yalnızca VADO uygulamasının içinde açılır.</p>',
    '<p id="left" hidden>Mini uygulama kapatıldı.</p>',
    `<script>${WRAPPER_SCRIPT}</script>`,
    "</body>",
    "</html>",
    "",
  ].join("\n");
}
