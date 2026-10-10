import {
  type Cart,
  type Catalog,
  type CatalogSelection,
  checkoutCartBodySchema,
  type DeliveryQuote,
  type LocationAddress,
  type Order,
  type StoreContext,
} from "@vado/contracts";
import { vado } from "@vado/miniapp-sdk";
import { unmetDeliveryMinimum } from "@vado/miniapp-shared/cart-rules";
import { money } from "@vado/miniapp-shared/catalog-options";
import { deliveryLaunchIntent } from "@vado/miniapp-shared/delivery-launch-intent";
import { ProductOptions } from "@vado/miniapp-shared/product-options";
import { sharedProductLaunch } from "@vado/miniapp-shared/shared-product-intent";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { z } from "zod";

import { canUseShopFulfilment, cartMatchesChoice, effectivePrice, orderStatus } from "./model";

const sessionSchema = z.object({
  businessId: z.uuid(),
  appInstanceId: z.uuid(),
  cartId: z.uuid().nullable(),
  orderId: z.uuid().nullable(),
  pending: checkoutCartBodySchema.extend({ id: z.uuid(), key: z.uuid() }).nullable(),
});
type Session = z.infer<typeof sessionSchema>;
type Pending = NonNullable<Session["pending"]>;
type Mode = "pickup" | "delivery";
interface LoadedQuote {
  branchId: string;
  addressId: string;
  quote: DeliveryQuote;
}
interface LoadedCatalog {
  branchId: string;
  catalog: Catalog;
}
const sessionKey = "shop-session-v1";
const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : "İşlem tamamlanamadı.";

export function App() {
  const [context, setContext] = useState<StoreContext | null>(null);
  const [branchId, setBranchId] = useState("");
  const [mode, setMode] = useState<Mode>("pickup");
  const [addresses, setAddresses] = useState<LocationAddress[]>([]);
  const [addressId, setAddressId] = useState("");
  // Katalog ve teslimat teklifi istendikleri seçimle saklanır; seçim değişince eski sonuç
  // kendiliğinden geçersiz olur, etkide sıfırlanmaz.
  const [loadedQuote, setLoadedQuote] = useState<LoadedQuote | null>(null);
  const [loadedCatalog, setLoadedCatalog] = useState<LoadedCatalog | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [previousOrders, setPreviousOrders] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<Catalog["items"][number] | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [priceChanged, setPriceChanged] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const contextRef = useRef<StoreContext | null>(null);
  const cartRef = useRef<Cart | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const orderRef = useRef<string | null>(null);
  const initialized = useRef(false);
  const mounted = useRef(false);
  const actionLock = useRef(false);

  function setCurrentCart(value: Cart | null) {
    if (
      value !== null &&
      cartRef.current?.id === value.id &&
      cartRef.current.version > value.version
    )
      return;
    cartRef.current = value;
    setCart(value);
  }
  function setPendingCheckout(value: Pending | null) {
    pendingRef.current = value;
    setPending(value);
  }
  async function persist() {
    const c = contextRef.current;
    if (c === null) return;
    const value: Session = {
      businessId: c.businessId,
      appInstanceId: c.appInstanceId,
      cartId: cartRef.current?.id ?? null,
      orderId: orderRef.current,
      pending: pendingRef.current,
    };
    await vado.storage.set(sessionKey, JSON.stringify(value));
  }
  async function run(action: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (cause) {
      if (mounted.current) setError(message(cause));
    } finally {
      actionLock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function loadOrders() {
    const list = await vado.ordering.listOrders({ limit: 20 });
    if (mounted.current) setPreviousOrders(list.items.map((item) => item.id));
  }
  /** Mağazayı, kayıtlı oturumu ve paylaşım bağlantısını yükler. */
  async function loadStore(active: () => boolean) {
    const [launch, store] = await Promise.all([vado.app.getContext(), vado.ordering.getStore()]);
    if (!active()) return;
    contextRef.current = store;
    setContext(store);
    const raw = await vado.storage.get(sessionKey);
    let saved: Session | null = null;
    if (raw !== null) {
      try {
        const parsed = sessionSchema.safeParse(JSON.parse(raw));
        if (
          parsed.success &&
          parsed.data.businessId === store.businessId &&
          parsed.data.appInstanceId === store.appInstanceId
        )
          saved = parsed.data;
      } catch {
        /* Bozuk oturum alışveriş başlatamaz. */
      }
    }
    let existing: Cart | null = null;
    if (saved?.cartId) {
      try {
        const restored = await vado.ordering.getCart({ id: saved.cartId });
        if (restored.status === "open") existing = restored;
        if (restored.status === "checked_out" && saved.pending !== null) {
          // Tekrar gönderim aynı idempotency anahtarını kullanır.
          const recovered = await vado.ordering.checkout(saved.pending);
          if (recovered.type === "order") {
            orderRef.current = recovered.order.id;
            setOrder(recovered.order);
          } else existing = recovered.cart;
        }
      } catch (cause) {
        // Geçici ağ hatasında kaydedilmiş idempotency anahtarını kaybetme.
        // Kullanıcı yeniden deneyebilir, aynı sipariş ikinci kez oluşmaz.
        throw new Error(`Kaydedilmiş sepet henüz doğrulanamadı: ${message(cause)}. Yeniden dene.`, {
          cause,
        });
      }
    }
    if (!active()) return;
    setCurrentCart(existing);
    setPendingCheckout(existing === null ? null : (saved?.pending ?? null));
    orderRef.current ??= saved?.orderId ?? null;
    const productIntent = sharedProductLaunch(launch.params, store, existing, null);
    const deliveryIntent = deliveryLaunchIntent(launch.params, store, existing, null);
    if (productIntent.type === "conflict") setNotice(productIntent.message);
    if (deliveryIntent.type === "conflict") setNotice(deliveryIntent.message);
    const selected =
      existing?.branchId ??
      (deliveryIntent.type === "ready" ? deliveryIntent.intent.branchId : null) ??
      (productIntent.type === "ready" ? productIntent.intent.branchId : null) ??
      store.branches[0]?.id ??
      "";
    const fulfilment: Mode =
      existing?.fulfilment === "delivery" || deliveryIntent.type === "ready"
        ? "delivery"
        : "pickup";
    if (!canUseShopFulfilment(store, fulfilment))
      setNotice(
        "Seçilen sipariş türü bu mağazada etkin değil. Güncel mağaza ayarlarını kontrol et.",
      );
    const chosenAddress =
      existing?.addressId ??
      (deliveryIntent.type === "ready" ? deliveryIntent.intent.addressId : "");
    setBranchId(selected);
    setMode(fulfilment);
    setAddressId(chosenAddress);
    await loadOrders();
    if (!active()) return;
    setReady(true);
    if (productIntent.type === "ready") {
      const menu = await vado.ordering.getCatalog({
        branchId: selected,
        includeUnavailable: true,
      });
      if (active()) {
        const item = menu.items.find((value) => value.id === productIntent.intent.itemId);
        if (item?.available && effectivePrice(menu, selected, item.id)) setSelectedItem(item);
        else setNotice("Paylaşılan ürün artık satışta değil. Güncel mağazayı inceleyebilirsin.");
      }
    }
    await persist();
  }
  async function initialize() {
    if (initialized.current || !vado.isAvailable()) return;
    initialized.current = true;
    // Her beklemeden sonra ekranın hâlâ açık olduğu yeniden okunur.
    const active = () => mounted.current;
    await loadStore(active).catch((cause: unknown) => {
      initialized.current = false;
      if (active()) setError(message(cause));
    });
  }
  const initializeEvent = useEffectEvent(() => initialize());
  useEffect(() => {
    mounted.current = true;
    if (vado.isAvailable()) {
      void initializeEvent();
    } else {
      queueMicrotask(() => {
        if (mounted.current) setError("Mağazayı VADO içinde aç.");
      });
    }
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!ready || branchId === "") return;
    let cancelled = false;
    void vado.ordering
      .getCatalog({ branchId, includeUnavailable: true })
      .then((result) => {
        if (!cancelled) setLoadedCatalog({ branchId, catalog: result });
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(message(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [ready, branchId]);
  useEffect(() => {
    if (!ready || mode !== "delivery" || addressId === "" || branchId === "") return;
    let cancelled = false;
    void vado.ordering
      .getDeliveryQuote({ branchId, addressId })
      .then((quote) => {
        if (!cancelled && quote.address.id === addressId && !quote.address.archived)
          setLoadedQuote({ branchId, addressId, quote });
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(`Teslimat uygun değil: ${message(cause)}`);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, branchId, mode, addressId]);

  async function selectDelivery() {
    await run(async () => {
      if (cartRef.current?.status === "open")
        throw new Error("Önce mevcut sepetini tamamla veya bırak.");
      const list = await vado.location.listAddresses();
      const usable = list.items.filter((a) => !a.archived);
      setAddresses(usable);
      const first = usable[0];
      if (first === undefined) {
        setNotice("Kayıtlı adresin yok. VADO profilinden önce adres eklemelisin.");
        return;
      }
      setMode("delivery");
      setAddressId((id) => (usable.some((a) => a.id === id) ? id : first.id));
    });
  }
  async function changeProduct(line: CatalogSelection) {
    await run(async () => {
      const c = contextRef.current;
      if (c === null || !canUseShopFulfilment(c, mode))
        throw new Error("Bu sipariş türü mağazada açık değil.");
      if (mode === "delivery") {
        if (!addressId) throw new Error("Teslimat adresi seç.");
        const quote = await vado.ordering.getDeliveryQuote({ branchId, addressId });
        if (quote.address.id !== addressId || quote.address.archived)
          throw new Error("Adres uygun değil.");
        setLoadedQuote({ branchId, addressId, quote });
      }
      if (pendingRef.current !== null)
        throw new Error("Devam eden sipariş onayı varken sepet değiştirilemez.");
      const current = cartRef.current;
      if (
        !cartMatchesChoice(current, {
          branchId,
          fulfilment: mode,
          addressId: mode === "delivery" ? addressId : null,
        })
      )
        throw new Error("Sepette farklı şube, adres veya sipariş türü var. Önce sepeti bırak.");
      const active =
        current?.status === "open"
          ? current
          : await vado.ordering.openCart({
              branchId,
              fulfilment: mode,
              addressId: mode === "delivery" ? addressId : null,
              tableSessionId: null,
              scheduledAt: null,
            });
      if (active !== current) {
        setCurrentCart(active);
        await persist();
      }
      const result = await vado.ordering.replaceCart({
        id: active.id,
        expectedVersion: active.version,
        lines: [
          ...active.lines.map((l) => ({
            itemId: l.itemId,
            quantity: l.quantity,
            optionIds: l.optionIds,
            note: l.note,
          })),
          line,
        ],
      });
      setCurrentCart(result.cart);
      setPendingCheckout(null);
      await persist();
      if (result.type === "cart_conflict") setNotice("Sepet değişmiş. Güncel hâlini kontrol et.");
      else setSelectedItem(null);
    });
  }
  async function quantity(index: number, delta: number) {
    await run(async () => {
      const current = cartRef.current;
      if (current === null || pendingRef.current !== null) return;
      const lines = current.lines.flatMap((line, i) => {
        const next = line.quantity + (i === index ? delta : 0);
        return next > 0
          ? [{ itemId: line.itemId, quantity: next, optionIds: line.optionIds, note: line.note }]
          : [];
      });
      const result = await vado.ordering.replaceCart({
        id: current.id,
        expectedVersion: current.version,
        lines,
      });
      setCurrentCart(result.cart);
      await persist();
      if (result.type === "cart_conflict") setNotice("Sepet değişti. Yeniden kontrol et.");
    });
  }
  async function clearCart() {
    await run(async () => {
      const current = cartRef.current;
      if (current === null || pendingRef.current !== null) return;
      const result = await vado.ordering.resetCart({
        id: current.id,
        expectedVersion: current.version,
      });
      if (result.type === "cart_conflict") {
        setCurrentCart(result.cart);
        setNotice("Sepet değişmiş. Güncel hâlini kontrol et.");
      } else {
        setCurrentCart(null);
        setLoadedQuote(null);
        setPriceChanged(false);
        setNotice("Sepet bırakıldı.");
      }
      await persist();
    });
  }
  async function checkout() {
    await run(async () => {
      const current = cartRef.current;
      if (current === null || current.lines.length === 0) return;
      if (current.lines.some((l) => !l.available || l.priceChanged))
        throw new Error("Ürün veya fiyat değişti. Sepetini kontrol et.");
      if (current.fulfilment === "delivery") {
        if (current.addressId === null || current.addressId === undefined)
          throw new Error("Teslimat adresi doğrulanamadı.");
        const quote = await vado.ordering.getDeliveryQuote({
          branchId: current.branchId,
          addressId: current.addressId,
        });
        if (quote.address.archived || quote.address.id !== current.addressId)
          throw new Error("Adres kullanılamıyor.");
      }
      const submitted = pendingRef.current ?? {
        id: current.id,
        key: crypto.randomUUID(),
        cartVersion: current.version,
        seenTotalMinor: current.totalMinor,
        quoteHash: current.quoteHash,
      };
      setPendingCheckout(submitted);
      await persist();
      const result = await vado.ordering.checkout(submitted);
      if (result.type === "cart_changed") {
        setCurrentCart(result.cart);
        setPendingCheckout(null);
        setPriceChanged(true);
        setNotice(
          "Fiyat, teslimat veya bulunurluk değişti. Yeni toplamı inceleyip yeniden onayla.",
        );
        await persist();
        return;
      }
      setCurrentCart(null);
      setPendingCheckout(null);
      orderRef.current = result.order.id;
      setOrder(result.order);
      setPriceChanged(false);
      setNotice("Sipariş mağazaya iletildi. Ödeme uygulama üzerinden alınmadı.");
      await persist();
      await loadOrders();
    });
  }
  async function showOrder(id: string) {
    await run(async () => {
      const detail = await vado.ordering.getOrder({ id });
      orderRef.current = detail.id;
      setOrder(detail);
      await persist();
    });
  }
  const c = context;
  const catalog = loadedCatalog?.branchId === branchId ? loadedCatalog.catalog : null;
  const delivery =
    mode === "delivery" && loadedQuote?.branchId === branchId && loadedQuote.addressId === addressId
      ? loadedQuote.quote
      : null;
  const openCart = cart?.status === "open";
  const choiceLocked = openCart || pending !== null;
  const branch = c?.branches.find((value) => value.id === branchId);
  const matches =
    catalog?.items.filter(
      (item) =>
        (category === "" || item.categoryId === category) &&
        `${item.name} ${item.description}`
          .toLocaleLowerCase("tr")
          .includes(search.toLocaleLowerCase("tr")),
    ) ?? [];
  const missingMinimum = unmetDeliveryMinimum(cart);
  const tagline = c?.storefront?.tagline ?? "";
  return (
    <main className="page">
      <header className="topbar">
        <div className="mark">V</div>
        <div className="brand">
          <strong>{c?.storefront?.title ?? c?.businessName ?? "VADO Shops"}</strong>
          <small>{tagline === "" ? "Mahallendeki mağaza, VADO'da" : tagline}</small>
        </div>
        <span className="shop-label">VADO Shops</span>
      </header>
      {c?.storefront?.coverUrl && (
        <div className="hero" style={{ backgroundImage: `url(${c.storefront.coverUrl})` }} />
      )}
      {error && (
        <div className="alert error" role="alert">
          {error}{" "}
          <button
            className="ghost"
            onClick={() => {
              setError("");
            }}
          >
            Kapat
          </button>
        </div>
      )}
      {notice && (
        <div className="alert" role="status">
          {notice}{" "}
          <button
            className="ghost"
            onClick={() => {
              setNotice("");
            }}
          >
            Tamam
          </button>
        </div>
      )}
      {!ready && (
        <section className="panel">
          <p>Mağaza hazırlanıyor…</p>
          <button onClick={() => void initialize()} disabled={busy}>
            Yeniden dene
          </button>
        </section>
      )}
      {ready && c && (
        <>
          <section className="chooser panel">
            <div>
              <label htmlFor="shop-branch">Mağaza şubesi</label>
              <select
                id="shop-branch"
                value={branchId}
                disabled={choiceLocked}
                onChange={(e) => {
                  setBranchId(e.target.value);
                  setSelectedItem(null);
                }}
              >
                {c.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <small>
                {branch?.address ?? ""} {branch?.openNow ? "· Açık" : "· Şu anda kapalı"}
              </small>
            </div>
            <div>
              <span className="field-label">Sipariş türü</span>
              <div className="segmented">
                <button
                  className={mode === "pickup" ? "active" : ""}
                  disabled={choiceLocked || !canUseShopFulfilment(c, "pickup")}
                  onClick={() => {
                    setMode("pickup");
                    setAddressId("");
                  }}
                >
                  Gel-al
                </button>
                <button
                  className={mode === "delivery" ? "active" : ""}
                  disabled={choiceLocked || !canUseShopFulfilment(c, "delivery")}
                  onClick={() => void selectDelivery()}
                >
                  Adrese teslim
                </button>
              </div>
            </div>
            {mode === "delivery" && (
              <div>
                <label htmlFor="shop-address">Teslimat adresi</label>
                <select
                  id="shop-address"
                  value={addressId}
                  disabled={choiceLocked}
                  onChange={(e) => {
                    setAddressId(e.target.value);
                  }}
                >
                  {addresses.some((a) => a.id === addressId) ? null : (
                    <option value={addressId}>Seçili adres</option>
                  )}
                  {addresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label} · {a.geography.neighborhood.name}
                    </option>
                  ))}
                </select>
                <small>
                  {delivery
                    ? `Teslimat ${money(delivery.feeMinor)} · En az ${money(delivery.minimumMinor)} · Yaklaşık ${delivery.deliveryMinutes} dk`
                    : "Teslimat bölgesi doğrulanıyor veya uygun değil."}
                </small>
              </div>
            )}
          </section>
          <div className="content">
            <section className="products panel">
              <div className="section-title">
                <div>
                  <small>MAĞAZAYI KEŞFET</small>
                  <h1>Ürünler</h1>
                </div>
                <span>{matches.length} ürün</span>
              </div>
              <div className="filters">
                <input
                  aria-label="Ürün ara"
                  placeholder="Ürün ara…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                  }}
                />
                <select
                  aria-label="Ürün kategorisi"
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                  }}
                >
                  <option value="">Tüm kategoriler</option>
                  {catalog?.categories.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              {catalog === null ? (
                <p>Güncel ürünler yükleniyor…</p>
              ) : (
                <div className="product-grid">
                  {matches.map((item) => {
                    const price = effectivePrice(catalog, branchId, item.id);
                    return (
                      <button
                        key={item.id}
                        className="product-card"
                        disabled={busy || !item.available || !price || !branch?.openNow}
                        onClick={() => {
                          setSelectedItem(item);
                        }}
                      >
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} loading="lazy" />
                        ) : (
                          <div className="product-placeholder">✦</div>
                        )}
                        <span className="product-name">{item.name}</span>
                        <span className="product-description">{item.description}</span>
                        <strong>{price ? money(price.amountMinor) : "Fiyat sor"}</strong>
                        {!item.available && <em>Tükendi</em>}
                      </button>
                    );
                  })}
                </div>
              )}
              {catalog?.items.length === 0 && <p>Bu şubede henüz satışta ürün bulunmuyor.</p>}
            </section>
            <aside className="side">
              <section className="panel cart-panel">
                <h2>Sepetin</h2>
                {cart === null || cart.lines.length === 0 ? (
                  <p className="muted">Henüz ürün eklemedin.</p>
                ) : (
                  <>
                    {cart.lines.map((line, index) => (
                      <div className="cart-line" key={line.id}>
                        <strong>{line.name}</strong>
                        <small>{line.options.map((o) => o.name).join(", ")}</small>
                        <div className="quantity">
                          <button
                            className="secondary"
                            disabled={busy || pending !== null}
                            onClick={() => void quantity(index, -1)}
                            aria-label="Azalt"
                          >
                            −
                          </button>
                          <span>{line.quantity}</span>
                          <button
                            className="secondary"
                            disabled={busy || pending !== null || line.quantity >= 99}
                            onClick={() => void quantity(index, 1)}
                            aria-label="Artır"
                          >
                            +
                          </button>
                          <b>{money(line.totalMinor)}</b>
                        </div>
                        {(!line.available || line.priceChanged) && <em>Ürün veya fiyat değişti</em>}
                      </div>
                    ))}
                    {cart.delivery && (
                      <p className="muted">Teslimat ücreti: {money(cart.delivery.feeMinor)}</p>
                    )}
                    <div className="total">
                      <span>Toplam</span>
                      <strong>{money(cart.totalMinor)}</strong>
                    </div>
                    {missingMinimum !== null && (
                      <p className="warning">
                        Bu adrese teslimat için minimum ürün tutarı: {money(missingMinimum)}
                      </p>
                    )}
                    {priceChanged && (
                      <p className="warning">
                        Fiyat veya uygunluk değişti. Yeniden onaylamadan önce kontrol et.
                      </p>
                    )}
                    <button
                      className="primary full"
                      disabled={
                        busy ||
                        (pending !== null && pending.id !== cart.id) ||
                        missingMinimum !== null ||
                        cart.lines.some((l) => !l.available || l.priceChanged) ||
                        !branch?.openNow
                      }
                      onClick={() => void checkout()}
                    >
                      {pending ? "Siparişi tekrar doğrula" : "Siparişi onayla"}
                    </button>
                    <button
                      className="ghost full"
                      disabled={busy || pending !== null}
                      onClick={() => void clearCart()}
                    >
                      Sepeti bırak
                    </button>
                    <small className="muted">
                      Bu ekranda online ödeme alınmaz. Sipariş talebin işletmeye iletilir.
                    </small>
                  </>
                )}
              </section>
              <section className="panel orders">
                <h2>Siparişlerin</h2>
                {previousOrders.length === 0 && (
                  <p className="muted">Henüz sipariş geçmişin yok.</p>
                )}
                {previousOrders.map((id) => (
                  <button
                    key={id}
                    className="order-link"
                    disabled={busy}
                    onClick={() => void showOrder(id)}
                  >
                    Sipariş {id.slice(0, 8)} · Görüntüle
                  </button>
                ))}
                {order && (
                  <div className="order-detail">
                    <b>{orderStatus[order.status] ?? order.status}</b>
                    <p>Toplam: {money(order.totalMinor)}</p>
                    <p>{order.lines.map((l) => `${l.quantity} × ${l.name}`).join(", ")}</p>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => void showOrder(order.id)}
                    >
                      Durumu yenile
                    </button>
                  </div>
                )}
              </section>
            </aside>
          </div>
        </>
      )}
      {selectedItem && catalog && (
        <ProductOptions
          item={selectedItem}
          catalog={catalog}
          branchId={branchId}
          onAdd={changeProduct}
          onClose={() => {
            setSelectedItem(null);
          }}
          busy={busy}
        />
      )}
    </main>
  );
}
