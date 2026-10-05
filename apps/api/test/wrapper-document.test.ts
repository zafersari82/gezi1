import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { renderWrapper, WRAPPER_SCRIPT } from "../src/modules/miniapps/wrapper-document";

const ENTRY_URL = "https://api.vado.test/apps/randevu/files/abc/index.html";
const CONNECT = { vado: 1, type: "connect" };
const LEFT_NOTICE = '{"vado":1,"type":"left"}';

type Receiver = (event: { data: unknown }) => void;

/**
 * Tarayıcının ileti kapısının (FakePort) betiğin kullandığı kadarı. Gerçek kapıdaki gibi,
 * dinleyici bağlanana kadar gelen iletiler bekletilir ve bir uç kapanınca öbürü de kapanır;
 * iletiler ise sınamalar sade kalsın diye anında teslim edilir.
 */
class FakePort {
  closed = false;
  private receiver: Receiver | null = null;
  private waiting: unknown[] = [];
  private peer: FakePort | null = null;

  static pair(): [FakePort, FakePort] {
    const first = new FakePort();
    const second = new FakePort();
    first.peer = second;
    second.peer = first;
    return [first, second];
  }

  get onmessage(): Receiver | null {
    return this.receiver;
  }

  set onmessage(receiver: Receiver | null) {
    this.receiver = receiver;
    if (receiver === null) return;
    for (const data of this.waiting.splice(0)) receiver({ data });
  }

  postMessage(data: unknown): void {
    this.peer?.receive(data);
  }

  close(): void {
    this.closed = true;
    if (this.peer !== null) this.peer.closed = true;
  }

  private receive(data: unknown): void {
    if (this.closed) return;
    if (this.receiver === null) this.waiting.push(data);
    else this.receiver({ data });
  }
}

class FakeChannel {
  readonly port1: FakePort;
  readonly port2: FakePort;

  constructor() {
    [this.port1, this.port2] = FakePort.pair();
  }
}

/** Pencereye gelen "message" olayının betiğin baktığı alanları. */
interface WindowMessage {
  source: object | null;
  origin: string;
  data: unknown;
  ports: FakePort[];
}

interface Surroundings {
  /** Telefondaki gibi: pencerede WebView'in ileti nesnesi var. */
  native: boolean;
  /** Web önizlemesindeki gibi: sayfa bir üst pencerenin çerçevesinde. */
  framed: boolean;
}

/** Kapıdan gelen iletileri sırasıyla toplar. */
function collect(port: FakePort): unknown[] {
  const received: unknown[] = [];
  port.onmessage = (event) => {
    received.push(event.data);
  };
  return received;
}

/**
 * Sarmalayıcı belgenin betiğini, tarayıcı penceresini taklit eden bir ortamda çalıştırır.
 * Betik tarayıcıya metin olarak gider; burada da aynı metin çalışır.
 */
function openWrapper({ native, framed }: Surroundings) {
  const messageListeners: ((event: WindowMessage) => void)[] = [];
  const violationListeners: ((event: { effectiveDirective: string }) => void)[] = [];
  const hidden: Record<string, boolean> = { alone: true, left: true };
  /** Telefonda WebView'in ileti kanalına yazılanlar. */
  const toNativeShell: string[] = [];
  /** Web önizlemesinde üst pencereye verilen kapılar. */
  const offeredToParent: { message: unknown; targetOrigin: string; port: FakePort }[] = [];

  const frame = {
    attributes: {} as Record<string, string>,
    title: "",
    src: "",
    attached: false,
    contentWindow: {},
    setAttribute(name: string, value: string) {
      this.attributes[name] = value;
    },
    remove() {
      this.attached = false;
    },
  };
  const window: Record<string, unknown> = {
    addEventListener: (_type: string, listener: (event: WindowMessage) => void) =>
      messageListeners.push(listener),
  };
  window.parent = framed
    ? {
        postMessage: (message: unknown, targetOrigin: string, [port]: FakePort[]) => {
          if (port !== undefined) offeredToParent.push({ message, targetOrigin, port });
        },
      }
    : window;
  if (native) {
    window.ReactNativeWebView = { postMessage: (message: string) => toNativeShell.push(message) };
  }
  const document = {
    title: "Kadıköy Berber",
    body: {
      getAttribute: (name: string) => (name === "data-entry" ? ENTRY_URL : null),
      appendChild: (node: typeof frame) => {
        node.attached = true;
      },
    },
    createElement: () => frame,
    getElementById: (id: string) => ({
      set hidden(value: boolean) {
        hidden[id] = value;
      },
    }),
    addEventListener: (_type: string, listener: (event: { effectiveDirective: string }) => void) =>
      violationListeners.push(listener),
  };

  runInNewContext(WRAPPER_SCRIPT, { window, document, MessageChannel: FakeChannel });

  const deliver = (event: WindowMessage) => {
    for (const listener of messageListeners) listener(event);
  };
  return {
    frame,
    hidden,
    toNativeShell,
    offeredToParent,
    /** Paketin sayfasından gelen bir pencere iletisi. */
    fromFrame: (data: unknown, ports: FakePort[] = [], origin = "null") => {
      deliver({ source: frame.contentWindow, origin, data, ports });
    },
    /** Başka bir pencereden gelen ileti. */
    fromElsewhere: (data: unknown, ports: FakePort[] = []) => {
      deliver({ source: {}, origin: "null", data, ports });
    },
    /** Telefondaki kabuğun pencereye bıraktığı yanıt: gönderen penceresi yoktur. */
    fromNativeShell: (data: unknown) => {
      deliver({ source: null, origin: "", data, ports: [] });
    },
    violate: (effectiveDirective: string) => {
      for (const listener of violationListeners) listener({ effectiveDirective });
    },
    /** Paketin SDK'sının yaptığı gibi sarmalayıcıya bir kapı verir; kendi ucunu döndürür. */
    connectApp() {
      const [mine, offered] = FakePort.pair();
      deliver({ source: frame.contentWindow, origin: "null", data: CONNECT, ports: [offered] });
      return { mine, offered };
    },
  };
}

const onPhone = () => openWrapper({ native: true, framed: false });
const inPreview = () => openWrapper({ native: false, framed: true });

describe("sarmalayıcı belge", () => {
  it("paketi kum havuzundaki çerçevede, giriş adresiyle açar", () => {
    const { frame, hidden } = onPhone();

    expect(frame.attached).toBe(true);
    expect(frame.src).toBe(ENTRY_URL);
    expect(frame.title).toBe("Kadıköy Berber");
    expect(frame.attributes).toEqual({
      sandbox: "allow-scripts allow-forms",
      referrerpolicy: "no-referrer",
    });
    expect(hidden).toEqual({ alone: true, left: true });
  });

  it("telefonda paketin kapısından geleni kabuğa, kabuğun yanıtını paketin kapısına aktarır", () => {
    const wrapper = onPhone();
    const app = wrapper.connectApp().mine;
    const received = collect(app);

    app.postMessage('{"vado":1,"id":"a1","method":"container.getInfo"}');
    expect(wrapper.toNativeShell).toEqual(['{"vado":1,"id":"a1","method":"container.getInfo"}']);

    wrapper.fromNativeShell('{"vado":1,"id":"a1","ok":true,"result":null}');
    expect(received).toEqual(['{"vado":1,"id":"a1","ok":true,"result":null}']);
  });

  it("telefonda bir pencereden gelen iletiyi kabuğun yanıtı saymaz", () => {
    const wrapper = onPhone();
    const received = collect(wrapper.connectApp().mine);

    // Paket ya da başka bir pencere, kabuk yanıtı gibi görünen bir ileti gönderemez.
    wrapper.fromFrame('{"vado":1,"id":"a1","ok":true,"result":"sahte"}');
    wrapper.fromElsewhere('{"vado":1,"id":"a1","ok":true,"result":"sahte"}');
    wrapper.fromNativeShell("gerçek yanıt");

    expect(received).toEqual(["gerçek yanıt"]);
  });

  it("web önizlemesinde üst pencereye kendi kapısını verir ve iki yönde aktarır", () => {
    const wrapper = inPreview();
    expect(wrapper.offeredToParent).toHaveLength(1);
    expect(wrapper.offeredToParent[0]).toMatchObject({ message: CONNECT, targetOrigin: "*" });
    const shell = wrapper.offeredToParent[0]?.port ?? new FakePort();
    const toShell = collect(shell);

    const app = wrapper.connectApp().mine;
    const toApp = collect(app);
    app.postMessage("istek");
    expect(toShell).toEqual(["istek"]);
    shell.postMessage("yanıt");
    expect(toApp).toEqual(["yanıt"]);

    // Web önizlemesinde yanıtlar yalnızca kapıdan gelir; pencereye bırakılan ileti aktarılmaz.
    wrapper.fromNativeShell("pencereye bırakılan");
    expect(toApp).toEqual(["yanıt"]);
  });

  it("yalnızca metin iletileri aktarır", () => {
    const wrapper = onPhone();
    const app = wrapper.connectApp().mine;
    const received = collect(app);

    app.postMessage({ vado: 1, id: "nesne" });
    app.postMessage("metin istek");
    expect(wrapper.toNativeShell).toEqual(["metin istek"]);

    wrapper.fromNativeShell({ vado: 1, id: "nesne" });
    wrapper.fromNativeShell("metin yanıt");
    expect(received).toEqual(["metin yanıt"]);
  });

  it("bağlantıyı yalnızca kendi çerçevesindeki kimliksiz sayfadan, kapısıyla gelirse kabul eder", () => {
    const wrapper = onPhone();
    const offer = () => FakePort.pair()[1];
    const rejected = {
      elsewhere: offer(),
      withOrigin: offer(),
      notConnect: offer(),
      version: offer(),
    };

    wrapper.fromElsewhere(CONNECT, [rejected.elsewhere]);
    wrapper.fromFrame(CONNECT, [rejected.withOrigin], "https://kotu.example.com");
    wrapper.fromFrame({ vado: 1, type: "left" }, [rejected.notConnect]);
    wrapper.fromFrame({ vado: 2, type: "connect" }, [rejected.version]);
    wrapper.fromFrame(CONNECT);
    wrapper.fromFrame(null);
    wrapper.fromFrame("connect");

    // Kabul edilmeyen kapı dinlenmez; reddedilen istekler çerçeveyi kapatmaz.
    for (const port of Object.values(rejected)) expect(port.onmessage).toBeNull();
    expect(wrapper.frame.attached).toBe(true);
    expect(wrapper.toNativeShell).toEqual([]);

    // Reddedilenlerden sonra gelen ilk geçerli bağlantı kabul edilir.
    wrapper.connectApp().mine.postMessage("istek");
    expect(wrapper.toNativeShell).toEqual(["istek"]);
  });

  it("çerçeveden ikinci bir bağlantı isteği gelirse çerçeveyi kaldırır ve kabuğa bildirir", () => {
    const wrapper = onPhone();
    const first = wrapper.connectApp();
    const received = collect(first.mine);

    // İlk sayfa gitmiş, çerçeveye yeni bir sayfa yüklenmiş demektir: o sayfa köprüye ulaşamaz.
    const second = wrapper.connectApp();

    expect(wrapper.frame.attached).toBe(false);
    expect(wrapper.hidden).toEqual({ alone: true, left: false });
    expect(wrapper.toNativeShell).toEqual([LEFT_NOTICE]);
    expect(second.offered.onmessage).toBeNull();
    expect(first.mine.closed).toBe(true);

    // Kapandıktan sonra hiçbir şey aktarılmaz ve yeni bağlantı kabul edilmez.
    first.mine.postMessage("geç kalan istek");
    wrapper.fromNativeShell("geç kalan yanıt");
    expect(wrapper.connectApp().offered.onmessage).toBeNull();
    expect(received).toEqual([]);
    expect(wrapper.toNativeShell).toEqual([LEFT_NOTICE]);
  });

  it("paket başka bir adrese gitmeye çalışırsa çerçeveyi kaldırır; başka ihlalleri yok sayar", () => {
    const wrapper = onPhone();
    wrapper.connectApp();

    // Örneğin tarayıcı eklentisinin eklediği bir görsel: paketle ilgisi yoktur.
    wrapper.violate("img-src");
    expect(wrapper.frame.attached).toBe(true);
    expect(wrapper.toNativeShell).toEqual([]);

    wrapper.violate("frame-src");
    wrapper.violate("frame-src");
    expect(wrapper.frame.attached).toBe(false);
    expect(wrapper.hidden.left).toBe(false);
    expect(wrapper.toNativeShell).toEqual([LEFT_NOTICE]);
  });

  it("web önizlemesinde ayrılma bildirimini üst pencereye kapıdan gönderir", () => {
    const wrapper = inPreview();
    const toShell = collect(wrapper.offeredToParent[0]?.port ?? new FakePort());

    wrapper.violate("frame-src");
    expect(toShell).toEqual([LEFT_NOTICE]);
    expect(wrapper.frame.attached).toBe(false);
  });

  it("kabuk yokken paketi yüklemez", () => {
    const wrapper = openWrapper({ native: false, framed: false });

    expect(wrapper.frame.attached).toBe(false);
    expect(wrapper.frame.src).toBe("");
    expect(wrapper.hidden).toEqual({ alone: false, left: true });
  });
});

describe("sarmalayıcı belgenin metni", () => {
  it("kaydın adını ve giriş adresini kod olarak yorumlanamayacak biçimde yazar", () => {
    const page = renderWrapper({
      name: `Ayşe's <b>"Kuaför"</b> & Güzellik`,
      entryUrl: 'https://api.vado.test/files/abc/index.html?a=1&b="2"',
    });

    expect(page).toContain(
      "<title>Ayşe&#39;s &lt;b&gt;&quot;Kuaför&quot;&lt;/b&gt; &amp; Güzellik</title>",
    );
    expect(page).toContain(
      '<body data-entry="https://api.vado.test/files/abc/index.html?a=1&amp;b=&quot;2&quot;">',
    );
    expect(page.startsWith("<!doctype html>\n")).toBe(true);
  });

  it("betik, sayfadaki betik etiketini kapatacak bir metin içermez", () => {
    expect(WRAPPER_SCRIPT).not.toMatch(/<\/script/i);
    expect(WRAPPER_SCRIPT).not.toContain("<!--");
  });
});
