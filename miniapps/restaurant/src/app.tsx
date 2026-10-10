import {
  type Cart,
  cartSchema,
  type Catalog,
  type CatalogSelection,
  checkoutCartBodySchema,
  type DeliveryQuote,
  mergeOrderSnapshot,
  type Order,
  type RestaurantContext,
  studioPaletteById,
  studioTemplateById,
  type TableSession,
} from "@vado/contracts";
import { vado } from "@vado/miniapp-sdk";
import { unmetDeliveryMinimum } from "@vado/miniapp-shared/cart-rules";
import { deliveryLaunchIntent } from "@vado/miniapp-shared/delivery-launch-intent";
import { ProductOptions } from "@vado/miniapp-shared/product-options";
import {
  type SharedProductIntent,
  sharedProductLaunch,
} from "@vado/miniapp-shared/shared-product-intent";
import { type CSSProperties, useEffect, useEffectEvent, useRef, useState } from "react";
import { z } from "zod";

import { Aftercare } from "./aftercare";
import { dateTime, money, states } from "./model";

const pendingSchema = checkoutCartBodySchema.extend({ id: z.uuid(), key: z.uuid() });
type Pending = z.infer<typeof pendingSchema>;
const storageKey = "restaurant-session";
/** Boş ya da yalnız boşluk içeren metin yayımlanmamış sayılır. */
const filled = (value: string | null | undefined) =>
  value === null || value === undefined || value.trim() === "" ? null : value;
const savedSchema = z.object({
  businessId: z.uuid(),
  appInstanceId: z.uuid(),
  cartId: z.uuid().nullable(),
  orderId: z.uuid().nullable(),
  pending: pendingSchema.nullable(),
});
type Saved = z.infer<typeof savedSchema>;
const failure = (cause: unknown) =>
  cause instanceof Error ? cause.message : "İşlem tamamlanamadı. Yeniden dene.";
export function App() {
  const [context, setContext] = useState<RestaurantContext | null>(null);
  const [table, setTable] = useState<TableSession | null>(null);
  const [branch, setBranch] = useState("");
  const [scheduled, setScheduled] = useState("");
  const [fulfilment, setFulfilment] = useState<"pickup" | "delivery">("pickup");
  const [deliveryAddressId, setDeliveryAddressId] = useState<string | null>(null);
  const [deliveryQuote, setDeliveryQuote] = useState<DeliveryQuote | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [past, setPast] = useState<string[]>([]);
  const [bill, setBill] = useState<{
    ownTotalMinor: number;
    ownPaidMinor: number;
    ownDueMinor: number;
  } | null>(null);
  const [product, setProduct] = useState<Catalog["items"][number] | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(true);
  const [ready, setReady] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const readyRef = useRef(false);
  const initLock = useRef(false);
  const lifecycle = useRef(0);
  const selection = useRef({ branch: "", scheduled: "" });
  const [priceChanged, setPriceChanged] = useState(false);
  const lock = useRef(false);
  const cartRef = useRef<Cart | null>(null);
  const orderId = useRef<string | null>(null);
  const pending = useRef<Pending | null>(null);
  const [pendingValue, updatePendingValue] = useState<Pending | null>(null);
  function setPending(value: Pending | null) {
    pending.current = value;
    updatePendingValue(value);
  }
  const contextRef = useRef<RestaurantContext | null>(null);
  const tableRef = useRef<TableSession | null>(null);
  const menuRequest = useRef(0);
  const sharedProduct = useRef<SharedProductIntent | null>(null);
  const deliverySelection = useRef<{ branchId: string; addressId: string } | null>(null);
  const cursor = useRef(0);
  const refreshLock = useRef(false);
  const alive = useRef(true);
  function acceptCart(value: Cart) {
    if (cartRef.current?.id === value.id && cartRef.current.version > value.version) return;
    cartRef.current = value;
    setCart(value);
  }
  async function save() {
    const c = contextRef.current;
    if (c === null) return;
    const value: Saved = {
      businessId: c.businessId,
      appInstanceId: c.appInstanceId,
      cartId: cartRef.current?.id ?? null,
      orderId: orderId.current,
      pending: pending.current,
    };
    await vado.storage.set(storageKey, JSON.stringify(value));
  }
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      if (alive.current) setError(failure(cause));
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function loadMenu() {
    const chosen = { ...selection.current };
    if (chosen.branch === "" || !readyRef.current) return;
    const request = ++menuRequest.current;
    const [menu, times] = await Promise.all([
      vado.ordering.getCatalog({
        branchId: chosen.branch,
        includeUnavailable: true,
        ...(chosen.scheduled === "" ? {} : { at: chosen.scheduled }),
      }),
      vado.ordering.getSlots({ branchId: chosen.branch }),
    ]);
    if (
      request !== menuRequest.current ||
      !alive.current ||
      selection.current.branch !== chosen.branch ||
      selection.current.scheduled !== chosen.scheduled
    )
      return;
    setCatalog(menu);
    setSlots(times.items.map((slot) => slot.at));
    // Dış paylaşımdan gelen ürün ancak bu şubenin güncel kataloğuyla açılır.
    const intent = sharedProduct.current;
    if (intent !== null && intent.branchId === chosen.branch) {
      sharedProduct.current = null; // Yeniden bağlanınca modal tekrar açılmaz.
      const item = menu.items.find((candidate) => candidate.id === intent.itemId);
      const hasPrice = menu.prices.some((price) => price.itemId === intent.itemId);
      if (item?.available && hasPrice) {
        setSearch("");
        setCategory(item.categoryId ?? "");
        setProduct(item); // Sepete kendiliğinden ekleme veya satın alma yok.
        setNotice("Paylaşılan ürünü açtık. Seçenekleri ve güncel fiyatı kontrol et.");
      } else {
        setNotice("Paylaşılan ürün bu şubede şu an sunulmuyor. Menüyü inceleyebilirsin.");
      }
    }
  }
  async function refresh() {
    const active = () => alive.current;
    if (!readyRef.current) {
      await initialize();
      return;
    }
    if (refreshLock.current || contextRef.current === null) return;
    refreshLock.current = true;
    try {
      const currentContext = await vado.ordering.getRestaurant();
      if (!active()) return;
      contextRef.current = currentContext;
      setContext(currentContext);
      await loadMenu();
      let replay = await vado.ordering.getEvents({ cursor: cursor.current });
      cursor.current = replay.cursor;
      while (replay.items.length === 500) {
        replay = await vado.ordering.getEvents({ cursor: cursor.current });
        cursor.current = replay.cursor;
      }
      const id = orderId.current;
      if (id !== null) {
        const detail = await vado.ordering.getOrder({ id });
        if (active() && orderId.current === id)
          setOrder((current) => mergeOrderSnapshot(current, detail));
      }
      const seating = tableRef.current;
      if (seating !== null) {
        const current = await vado.ordering.getTable({ id: seating.id });
        const currentBill = await vado.ordering.getBill({ id: seating.id });
        if (active() && tableRef.current?.id === seating.id) {
          tableRef.current = current;
          setTable(current);
          setBill(currentBill);
        }
      }
      if (active()) setConnected(true);
    } catch {
      if (active()) setConnected(false);
    } finally {
      refreshLock.current = false;
    }
  }
  async function initialize() {
    if (initLock.current || readyRef.current || !vado.isAvailable()) return;
    initLock.current = true;
    setInitializing(true);
    setError("");
    const attempt = lifecycle.current;
    const active = () => alive.current && attempt === lifecycle.current;
    try {
      const launch = await vado.app.getContext();
      const c = await vado.ordering.getRestaurant();
      const raw = await vado.storage.get(storageKey);
      if (!active()) return;
      contextRef.current = c;
      setContext(c);
      let saved: Saved | null = null;
      if (raw !== null) {
        try {
          const parsed = savedSchema.safeParse(JSON.parse(raw));
          if (
            parsed.success &&
            parsed.data.businessId === c.businessId &&
            parsed.data.appInstanceId === c.appInstanceId
          )
            saved = parsed.data;
        } catch {
          saved = null;
        }
      }
      let seating: TableSession | null = null;
      if (launch.params.masa) seating = await vado.ordering.joinTable();
      if (!active()) return;
      tableRef.current = seating;
      setTable(seating);
      cartRef.current = null;
      setCart(null);
      setPending(saved?.pending ?? null);
      orderId.current = saved?.orderId ?? null;
      let restoredCart: Cart | null = null;
      if (saved?.cartId) {
        const existing = await vado.ordering.getCart({ id: saved.cartId });
        if (!active()) return;
        if (existing.status === "checked_out" && saved.pending !== null) {
          const recovered = await vado.ordering.checkout(saved.pending);
          if (!active()) return;
          if (recovered.type !== "order")
            throw new Error("Sipariş sonucu doğrulanamadı. Yeniden dene.");
          orderId.current = recovered.order.id;
          setOrder(recovered.order);
          setPending(null);
          await save();
        } else if (
          existing.status === "open" &&
          (seating === null || existing.context?.id === seating.id)
        ) {
          restoredCart = existing;
          acceptCart(existing);
        } else setPending(null);
      } else setPending(null);
      const sharedLaunch = sharedProductLaunch(launch.params, c, restoredCart, seating);
      sharedProduct.current = sharedLaunch.type === "ready" ? sharedLaunch.intent : null;
      if (sharedLaunch.type === "conflict") setNotice(sharedLaunch.message);
      const deliveryLaunch = deliveryLaunchIntent(launch.params, c, restoredCart, seating);
      if (deliveryLaunch.type === "conflict") setNotice(deliveryLaunch.message);
      const restoredDelivery =
        restoredCart?.status === "open" &&
        restoredCart.fulfilment === "delivery" &&
        restoredCart.addressId
          ? { branchId: restoredCart.branchId, addressId: restoredCart.addressId }
          : null;
      const missingDeliveryAddress =
        restoredCart?.status === "open" &&
        restoredCart.fulfilment === "delivery" &&
        restoredDelivery === null;
      if (missingDeliveryAddress)
        setNotice("Önceki teslimat sepetinin adresi doğrulanamadı. Sepeti bırakıp yeniden seç.");
      const choice = deliveryLaunch.type === "ready" ? deliveryLaunch.intent : restoredDelivery;
      deliverySelection.current = choice;
      setFulfilment(choice !== null || missingDeliveryAddress ? "delivery" : "pickup");
      setDeliveryAddressId(choice?.addressId ?? null);
      setDeliveryQuote(null);
      const chosenBranch =
        seating?.branchId ??
        restoredCart?.branchId ??
        choice?.branchId ??
        sharedProduct.current?.branchId ??
        c.branches[0]?.id ??
        "";
      const chosenTime = restoredCart?.scheduledAt ?? "";
      selection.current = { branch: chosenBranch, scheduled: chosenTime };
      setBranch(chosenBranch);
      setScheduled(chosenTime);
      if (choice !== null) {
        try {
          const quote = await vado.ordering.getDeliveryQuote({
            branchId: choice.branchId,
            addressId: choice.addressId,
            ...(chosenTime === "" ? {} : { scheduledAt: chosenTime }),
          });
          if (!active()) return;
          if (quote.address.id !== choice.addressId || quote.address.archived) {
            throw new Error("Teslimat adresi değişmiş; yeniden seçmelisin.");
          }
          setDeliveryQuote(quote);
        } catch (cause) {
          if (!active()) return;
          setNotice(`Teslimat şu an doğrulanamadı: ${failure(cause)}`);
        }
      }
      const previous = await vado.ordering.listOrders({ limit: 30 });
      if (!active()) return;
      if (orderId.current === null && previous.items[0]) orderId.current = previous.items[0].id;
      const notification = z.uuid().safeParse(launch.params.orderId);
      if (notification.success) {
        try {
          const requested = await vado.ordering.getOrder({ id: notification.data });
          if (!active()) return;
          orderId.current = requested.id;
          setOrder(requested);
        } catch {
          if (active())
            setNotice("Bildirimdeki sipariş açılamadı. Kendi siparişlerini görebilirsin.");
        }
      }
      const ids = previous.items.map((o) => o.id);
      if (orderId.current !== null && !ids.includes(orderId.current)) ids.unshift(orderId.current);
      setPast(ids);
      readyRef.current = true;
      setReady(true);
      await save();
      await refresh();
    } catch (cause) {
      if (active()) {
        setError(failure(cause));
        setConnected(false);
      }
    } finally {
      initLock.current = false;
      if (active()) setInitializing(false);
    }
  }
  const refreshEvent = useEffectEvent(() => refresh());
  const initializeEvent = useEffectEvent(() => initialize());
  useEffect(() => {
    const lifecycleRef = lifecycle;
    const menuRef = menuRequest;
    alive.current = true;
    if (!vado.isAvailable()) {
      queueMicrotask(() => {
        setError("Restoranı VADO uygulamasında aç.");
      });
      return;
    }
    void initializeEvent();
    const unsub = vado.ordering.onChange(() => {
      void refreshEvent();
    });
    const conn = vado.ordering.onConnection((value) => {
      setConnected(value);
      if (value) void refreshEvent();
    });
    const timer = setInterval(() => {
      void refreshEvent();
    }, 4000);
    return () => {
      alive.current = false;
      lifecycleRef.current++;
      menuRef.current++;
      sharedProduct.current = null;
      unsub();
      conn();
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (branch === "" || !ready) return;
    selection.current = { branch, scheduled };
    void loadMenu().catch((cause: unknown) => {
      if (
        alive.current &&
        selection.current.branch === branch &&
        selection.current.scheduled === scheduled
      )
        setError(failure(cause));
    });
    if (fulfilment === "delivery" && deliverySelection.current?.branchId === branch) {
      const addressId = deliverySelection.current.addressId;
      let cancelled = false;
      setDeliveryQuote(null);
      void vado.ordering
        .getDeliveryQuote({
          branchId: branch,
          addressId,
          ...(scheduled === "" ? {} : { scheduledAt: scheduled }),
        })
        .then((quote) => {
          if (!cancelled && quote.address.id === addressId && !quote.address.archived)
            setDeliveryQuote(quote);
        })
        .catch((cause: unknown) => {
          if (!cancelled) setNotice(`Teslimat uygunluğu yenilenemedi: ${failure(cause)}`);
        });
      return () => {
        cancelled = true;
      };
    }
  }, [branch, scheduled, ready, fulfilment]);
  async function resetCart() {
    await run(async () => {
      const current = cartRef.current;
      if (current === null || pending.current !== null) return;
      const result = await vado.ordering.resetCart({
        id: current.id,
        expectedVersion: current.version,
      });
      if (result.type === "cart_conflict") {
        acceptCart(result.cart);
        setNotice("Sepet başka bir ekranda değişti. Kontrol edip bırakmayı yeniden onayla.");
        await save();
        return;
      }
      cartRef.current = null;
      setCart(null);
      selection.current.scheduled = "";
      setScheduled("");
      setPriceChanged(false);
      setProduct(null);
      if (fulfilment === "delivery" && deliverySelection.current === null) {
        setFulfilment("pickup");
        setDeliveryAddressId(null);
        setDeliveryQuote(null);
      }
      setNotice("Sepet bırakıldı. Şube ve teslim zamanını yeniden seçebilirsin.");
      await save();
      await refresh();
    });
  }
  async function checkDeliveryQuote() {
    const choice = deliverySelection.current;
    if (choice?.branchId !== branch) throw new Error("Teslimat şubesini yeniden seç.");
    const quote = await vado.ordering.getDeliveryQuote({
      branchId: choice.branchId,
      addressId: choice.addressId,
      ...(scheduled === "" ? {} : { scheduledAt: scheduled }),
    });
    if (quote.address.id !== choice.addressId || quote.address.archived) {
      throw new Error("Teslimat adresi artık kullanılamıyor.");
    }
    setDeliveryQuote(quote);
    return quote;
  }
  async function add(line: CatalogSelection) {
    await run(async () => {
      let current = cartRef.current;
      if (current?.status !== "open") {
        // The host checks the user's live address and the selected branch again.
        if (fulfilment === "delivery") await checkDeliveryQuote();
        current = await vado.ordering.openCart({
          branchId: branch,
          fulfilment: tableRef.current !== null ? "dine_in" : fulfilment,
          ...(fulfilment === "delivery" && deliveryAddressId !== null
            ? { addressId: deliveryAddressId }
            : {}),
          context:
            tableRef.current === null ? null : { kind: "table_session", id: tableRef.current.id },
          scheduledAt: scheduled || null,
        });
        acceptCart(current);
        await save();
      }
      const lines = current.lines.map((l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        optionIds: l.optionIds,
        note: l.note ?? "",
      }));
      const result = await vado.ordering.replaceCart({
        id: current.id,
        expectedVersion: current.version,
        lines: [...lines, line],
      });
      acceptCart(result.cart);
      setPending(null);
      await save();
      if (result.type === "cart_conflict")
        setNotice("Sepet başka bir ekranda değişti. Güncel sepeti kontrol et.");
      else setProduct(null);
    });
  }
  async function editCart(index: number, delta: number) {
    await run(async () => {
      const current = cartRef.current;
      if (current === null) return;
      const lines = current.lines.flatMap((l, i) =>
        i !== index || l.quantity + delta > 0
          ? [
              {
                itemId: l.itemId,
                quantity: l.quantity + (i === index ? delta : 0),
                optionIds: l.optionIds,
                note: l.note ?? "",
              },
            ]
          : [],
      );
      const result = await vado.ordering.replaceCart({
        id: current.id,
        expectedVersion: current.version,
        lines,
      });
      acceptCart(result.cart);
      setPending(null);
      await save();
      if (result.type === "cart_conflict") setNotice("Sepet değişti. Güncel seçimleri kontrol et.");
    });
  }
  async function checkout() {
    await run(async () => {
      const current = cartRef.current;
      if (current === null) return;
      if (current.fulfilment === "delivery" && pending.current === null) {
        await checkDeliveryQuote();
      }
      const body = pending.current ?? {
        id: current.id,
        key: crypto.randomUUID(),
        cartVersion: current.version,
        seenTotalMinor: current.totalMinor,
        quoteHash: current.quoteHash,
      };
      setPending(body);
      await save();
      let result;
      try {
        result = await vado.ordering.checkout(body);
      } catch (cause) {
        if (
          typeof cause === "object" &&
          cause !== null &&
          "code" in cause &&
          ["branch_closed", "fulfilment_unavailable", "cart_expired"].includes(String(cause.code))
        ) {
          setPending(null);
          await save();
        }
        throw cause;
      }
      if (result.type === "cart_changed") {
        setPending(null);
        acceptCart(cartSchema.parse(result.cart));
        setPriceChanged(true);
        setNotice("Fiyat veya bulunurluk değişti. Güncel sepeti incele ve tekrar onayla.");
        await save();
        return;
      }
      setPending(null);
      orderId.current = result.order.id;
      setOrder(result.order);
      setPast((items) => [result.order.id, ...items.filter((id) => id !== result.order.id)]);
      cartRef.current = null;
      setCart(null);
      setPriceChanged(false);
      setNotice("Siparişin işletmeye ulaştı.");
      await save();
      await refresh();
    });
  }
  async function request(kind: "waiter" | "bill") {
    await run(async () => {
      const s = tableRef.current;
      if (s === null) return;
      await vado.ordering.requestService({ id: s.id, kind, key: crypto.randomUUID() });
      setNotice(kind === "waiter" ? "Garson çağrın iletildi." : "Hesap isteğin iletildi.");
      await refresh();
    });
  }
  const storefront = context?.storefront;
  const storefrontPalette = storefront ? studioPaletteById(storefront.palette) : null;
  const presentation = storefront ? studioTemplateById(storefront.templateId) : null;
  const storefrontLayout = presentation?.layout ?? "classic";
  const storefrontStyle =
    storefrontPalette === null
      ? undefined
      : ({
          "--green": storefrontPalette.accent,
          "--store-surface": storefrontPalette.surface,
        } as CSSProperties);
  const selectedBranch = context?.branches.find((b) => b.id === branch);
  const belowDeliveryMinimum = unmetDeliveryMinimum(cart) !== null;
  const canOrder =
    ready &&
    branch !== "" &&
    (fulfilment !== "delivery" || (deliveryQuote !== null && deliveryAddressId !== null)) &&
    (table === null || table.status === "open") &&
    selectedBranch?.openNow === true;
  return (
    <main className="page" data-storefront-layout={storefrontLayout} style={storefrontStyle}>
      <header>
        <span className="brand">
          VADO <span>Restoran</span>
        </span>
        <small className={connected ? "connection" : "connection disconnected"}>
          {connected ? "Canlı durum" : "Bağlantı kesildi · yeniden deneniyor"}
        </small>
      </header>
      <section className="intro storefront-intro" data-layout={storefrontLayout}>
        {storefront?.coverUrl && (
          <img
            className="storefront-cover"
            src={storefront.coverUrl}
            alt="Restoran kapak fotoğrafı"
          />
        )}
        {storefront?.logoUrl && (
          <img className="storefront-logo" src={storefront.logoUrl} alt="Restoran logosu" />
        )}
        <span className="eyebrow">{presentation?.eyebrow ?? "Masana gelen lezzet"}</span>
        <h1>{filled(storefront?.title) ?? context?.businessName ?? "Restoran"}</h1>
        <p>{filled(storefront?.tagline) ?? "Menüyü keşfet, dilediğin gibi özelleştir."}</p>
        {storefrontLayout === "enterprise" && (context?.branches.length ?? 0) > 1 && (
          <div className="storefront-branch-count">
            {context?.branches.length} şube · Sipariş vereceğin şubeyi aşağıdan seçebilirsin.
          </div>
        )}
      </section>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {!ready && vado.isAvailable() && (
        <button disabled={initializing} onClick={() => void initialize()}>
          {initializing ? "Yükleniyor…" : "Yeniden dene"}
        </button>
      )}
      {ready && (
        <>
          <section className="service-bar">
            {table ? (
              <>
                <strong>{table.label}</strong>
                <span>
                  {table.status === "closed" ? "Masa oturumu kapatıldı" : "Masada servis"}
                </span>
                <button
                  className="secondary"
                  disabled={busy || table.status !== "open"}
                  onClick={() => void request("waiter")}
                >
                  Garson çağır
                </button>
                <button
                  className="secondary"
                  disabled={busy || table.status !== "open"}
                  onClick={() => void request("bill")}
                >
                  Hesap iste
                </button>
                {bill && (
                  <p>
                    Senin hesabın {money(bill.ownTotalMinor)} · Ödenecek {money(bill.ownDueMinor)}
                  </p>
                )}
              </>
            ) : fulfilment === "delivery" ? (
              <>
                <strong>Adrese teslimat · {selectedBranch?.name ?? "Seçilen şube"}</strong>
                {deliveryQuote !== null ? (
                  <div className="delivery-summary">
                    <p>
                      {deliveryQuote.address.label} ·{" "}
                      {deliveryQuote.address.geography.neighborhood.name}
                    </p>
                    <p>
                      {deliveryQuote.address.addressLine} · {deliveryQuote.address.door}
                    </p>
                    <p>
                      Servis ücreti {money(deliveryQuote.feeMinor)} · En az{" "}
                      {money(deliveryQuote.minimumMinor)}
                    </p>
                    <p>Tahmini teslimat {deliveryQuote.deliveryMinutes} dakika</p>
                    <small>Kesin tutar ve uygunluk siparişten önce yeniden doğrulanır.</small>
                  </div>
                ) : (
                  <p role="alert" className="error">
                    Teslimat uygunluğu doğrulanamadı. Şu an sipariş verilemez.
                  </p>
                )}
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await checkDeliveryQuote();
                    })
                  }
                >
                  Teslimat bilgisini yenile
                </button>
                <label>
                  Teslim zamanı · {selectedBranch?.timezone}
                  <select
                    value={scheduled}
                    disabled={cart !== null || busy}
                    onChange={(e) => {
                      selection.current.scheduled = e.target.value;
                      setScheduled(e.target.value);
                      setCatalog(null);
                      setDeliveryQuote(null);
                    }}
                  >
                    <option value="">
                      Şimdi · yaklaşık {selectedBranch?.preparationMinutes} dk
                    </option>
                    {slots.map((at) => (
                      <option key={at} value={at}>
                        {selectedBranch && dateTime(at, selectedBranch.timezone)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : (
              <>
                <label>
                  Gel al · Şube
                  <select
                    value={branch}
                    disabled={cart !== null || busy}
                    onChange={(e) => {
                      selection.current.branch = e.target.value;
                      setCatalog(null);
                      setBranch(e.target.value);
                    }}
                  >
                    {context?.branches.map((b) => (
                      <option value={b.id} key={b.id}>
                        {b.name} · {b.openNow ? "Açık" : "Kapalı"}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Teslim zamanı · {selectedBranch?.timezone}
                  <select
                    value={scheduled}
                    disabled={cart !== null || busy}
                    onChange={(e) => {
                      selection.current.scheduled = e.target.value;
                      setCatalog(null);
                      setScheduled(e.target.value);
                    }}
                  >
                    <option value="">
                      Şimdi · yaklaşık {selectedBranch?.preparationMinutes} dk
                    </option>
                    {slots.map((at) => (
                      <option key={at} value={at}>
                        {selectedBranch && dateTime(at, selectedBranch.timezone)}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            {!canOrder && (
              <p className="error">
                {table?.status === "closed"
                  ? "Tekrar sipariş vermek için masanın QR kodunu VADO ile yeniden okut."
                  : fulfilment === "delivery" && deliveryQuote === null
                    ? "Bu adres için teslimat doğrulanmadan sipariş verilemez."
                    : "Şube şu anda kapalı; çalışma saatlerinde sipariş verebilirsin."}
              </p>
            )}
          </section>
          <div className="restaurant-layout">
            <section>
              <div className="menu-heading">
                <h2>{presentation?.menuHeading ?? "Menü"}</h2>
                <input
                  aria-label="Menüde ara"
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                  }}
                  placeholder="Ürün ara"
                />
              </div>
              <nav className="category-tabs" aria-label="Menü kategorisi">
                <button
                  className={category === "" ? "selected" : "secondary"}
                  onClick={() => {
                    setCategory("");
                  }}
                >
                  Tümü
                </button>
                {catalog?.categories
                  .filter((c) => c.active)
                  .map((c) => (
                    <button
                      className={category === c.id ? "selected" : "secondary"}
                      key={c.id}
                      onClick={() => {
                        setCategory(c.id);
                      }}
                    >
                      {c.name}
                    </button>
                  ))}
              </nav>
              <p className="muted small">Menü ve bulunurluk seçtiğin saate göre gösterilir.</p>
              <div className="menu-grid">
                {catalog?.items
                  .filter(
                    (i) =>
                      (category === "" || i.categoryId === category) &&
                      i.name.toLocaleLowerCase("tr").includes(search.toLocaleLowerCase("tr")),
                  )
                  .map((i) => (
                    <button
                      className="menu-item"
                      key={i.id}
                      disabled={!i.available || !canOrder || busy}
                      onClick={() => {
                        setProduct(i);
                      }}
                    >
                      {i.imageUrl ? (
                        <img className="menu-image" src={i.imageUrl} alt={`${i.name} fotoğrafı`} />
                      ) : (
                        <span className="item-symbol">✦</span>
                      )}
                      <strong>{i.name}</strong>
                      <span>{i.description}</span>
                      <b>
                        {money(
                          (
                            catalog.prices.find(
                              (p) => p.itemId === i.id && p.branchId === branch,
                            ) ??
                            catalog.prices.find((p) => p.itemId === i.id && p.branchId === null)
                          )?.amountMinor ?? 0,
                        )}
                      </b>
                      {!i.available && <em>Bu saatte sunulmuyor / tükendi</em>}
                    </button>
                  ))}
              </div>
              {catalog === null && <p role="status">Menü yükleniyor…</p>}
              {catalog?.items.length === 0 && <p>Bu şubede henüz sunulan ürün yok.</p>}
            </section>
            <aside>
              <section className="cart-panel">
                <h2>Sepetin</h2>
                {cart === null || cart.lines.length === 0 ? (
                  <p className="muted">Menüden bir ürün seç.</p>
                ) : (
                  <>
                    {cart.lines.map((l, i) => (
                      <div className="cart-line" key={l.id}>
                        <strong>{l.name}</strong>
                        <small>
                          {l.options.map((o) => o.name).join(", ")}
                          {l.note ? ` · ${l.note}` : ""}
                        </small>
                        {!l.available && (
                          <p className="error">Ürün artık sunulmuyor; sepetten çıkar.</p>
                        )}
                        <div className="quantity">
                          <button
                            className="secondary"
                            disabled={busy || pendingValue !== null}
                            aria-label={`${l.name} azalt`}
                            onClick={() => void editCart(i, -1)}
                          >
                            −
                          </button>
                          <span>{l.quantity}</span>
                          <button
                            className="secondary"
                            disabled={busy || pendingValue !== null || l.quantity >= 99}
                            aria-label={`${l.name} artır`}
                            onClick={() => void editCart(i, 1)}
                          >
                            +
                          </button>
                          <b>{money(l.totalMinor)}</b>
                        </div>
                      </div>
                    ))}
                    <div className="cart-total">
                      <span>Toplam · KDV dahil</span>
                      <strong>{money(cart.totalMinor)}</strong>
                    </div>
                    {belowDeliveryMinimum && cart.delivery && (
                      <p role="alert" className="error">
                        Teslimat için ürün toplamı en az {money(cart.delivery.minimumMinor)} olmalı.
                        Teslimat ücreti asgari tutara dahil değildir.
                      </p>
                    )}
                    <p className="muted small">
                      {cart.fulfilment === "delivery"
                        ? "Teslimat siparişi · mevcut işletme tahsilat akışı geçerlidir."
                        : "Ödeme masada veya kasada yapılır."}
                    </p>
                    <button
                      disabled={
                        busy ||
                        (pendingValue === null &&
                          (!canOrder ||
                            belowDeliveryMinimum ||
                            cart.lines.some((l) => !l.available)))
                      }
                      onClick={() => void checkout()}
                    >
                      {busy
                        ? "İşleniyor…"
                        : pendingValue !== null
                          ? "Sipariş sonucunu yeniden sorgula"
                          : priceChanged
                            ? "Güncel fiyatı onayla ve sipariş ver"
                            : "Sipariş ver"}
                    </button>
                    {pendingValue !== null && (
                      <p className="muted">Aynı sipariş anahtarıyla tekrar denenir.</p>
                    )}
                  </>
                )}
                {cart !== null && (
                  <button
                    className="secondary"
                    disabled={busy || pendingValue !== null}
                    onClick={() => void resetCart()}
                  >
                    {table === null ? "Sepeti bırak ve yeni zaman seç" : "Sepeti bırak"}
                  </button>
                )}
              </section>
              {order && (
                <section className="status-panel" aria-label="Sipariş durumu">
                  <span className="eyebrow">Sipariş #{order.id.slice(0, 8).toUpperCase()}</span>
                  <h2>{states[order.status] ?? order.status}</h2>
                  {order.estimatedReadyAt && (
                    <p>Tahmini hazır: {dateTime(order.estimatedReadyAt, order.branchTimezone)}</p>
                  )}
                  {order.rejectionReason && (
                    <p role="alert">Ret gerekçesi: {order.rejectionReason}</p>
                  )}
                  <p>
                    {order.paymentStatus === "paid" ? "Ödendi" : "Ödeme bekliyor"} ·{" "}
                    {money(order.totalMinor)}
                  </p>
                  <ul>
                    {order.lines.map((l) => (
                      <li key={l.id}>
                        {l.quantity} × {l.name}
                        {l.note ? ` · ${l.note}` : ""}
                      </li>
                    ))}
                  </ul>
                  {past.length > 1 && (
                    <label>
                      Diğer siparişlerin
                      <select
                        value={order.id}
                        onChange={(e) => {
                          orderId.current = e.target.value;
                          setOrder(null);
                          void refresh();
                          void save();
                        }}
                      >
                        {past.map((id) => (
                          <option key={id} value={id}>
                            #{id.slice(0, 8).toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                </section>
              )}
              {order && <Aftercare key={order.id} order={order} busy={busy} onNotice={setNotice} />}
            </aside>
          </div>
        </>
      )}
      {product && catalog && (
        <ProductOptions
          item={product}
          catalog={catalog}
          branchId={branch}
          busy={busy || pendingValue !== null || !canOrder}
          onAdd={add}
          onClose={() => {
            setProduct(null);
          }}
        />
      )}
    </main>
  );
}
