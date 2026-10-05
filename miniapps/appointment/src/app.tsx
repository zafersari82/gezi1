import { vado, VadoError } from "@vado/miniapp-sdk";
import { useEffect, useState } from "react";

import {
  type Booking,
  createOrderId,
  formatPrice,
  parseBooking,
  PREVIEW_SETTINGS,
  type Settings,
  settingsFrom,
  slotsFor,
  upcomingDays,
} from "./catalog";

const STORAGE_KEY = "son-randevu";

export function App() {
  const insideVado = vado.isAvailable();
  // VADO içinde ayarlar kabuktan gelir; gelene kadar ekran boş kalır ki başka bir işletmenin adı
  // bir an bile görünmesin.
  const [settings, setSettings] = useState<Settings | null>(insideVado ? null : PREVIEW_SETTINGS);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!insideVado) return;
    vado.app
      .getContext()
      .then((context) => {
        setSettings(settingsFrom(context.config));
      })
      .catch(() => {
        setFailed(true);
      });
  }, [insideVado]);

  if (settings === null) {
    return (
      <main className="page">
        {failed ? (
          <p className="error" role="alert">
            İşletmenin ayarları okunamadı. Mini uygulamayı kapatıp yeniden aç.
          </p>
        ) : (
          <p className="lead" role="status">
            Yükleniyor…
          </p>
        )}
      </main>
    );
  }
  return <Booker settings={settings} insideVado={insideVado} />;
}

function Booker({ settings, insideVado }: { settings: Settings; insideVado: boolean }) {
  const { businessName, merchantId, services } = settings;
  const [days] = useState(() => upcomingDays());
  const [firstName, setFirstName] = useState<string | null>(null);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [dayKey, setDayKey] = useState(days[0]?.key ?? "");
  const [time, setTime] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!insideVado) return;
    vado.identity
      .getProfile()
      .then((profile) => {
        setFirstName(profile.displayName.split(" ")[0] ?? null);
      })
      .catch(() => {
        // Kullanıcı profil iznini vermeyebilir; selamlama adsız kalır.
      });
    vado.storage
      .get(STORAGE_KEY)
      .then((value) => {
        setBooking(parseBooking(value));
      })
      .catch(() => {
        // Kayıtlı randevu okunamazsa form boş açılır.
      });
  }, [insideVado]);

  const service = services.find((item) => item.id === serviceId);
  const day = days.find((item) => item.key === dayKey);
  const slots = day === undefined ? [] : slotsFor(day);
  const canBook = insideVado && merchantId !== null && service !== undefined && time !== null;

  async function book() {
    if (day === undefined || time === null || service === undefined || merchantId === null) return;
    setError(null);
    setBusy(true);
    try {
      const payment = await vado.payment.request({
        merchantId,
        orderId: createOrderId(day, time),
        description: `${service.name}, ${day.dateLabel} ${time}`,
        amountMinor: service.priceMinor,
      });
      const next: Booking = {
        serviceName: service.name,
        dayLabel: day.dateLabel,
        time,
        amountMinor: service.priceMinor,
        paymentId: payment.paymentId,
      };
      await vado.storage.set(STORAGE_KEY, JSON.stringify(next));
      setBooking(next);
      setConfirmed(true);
    } catch (cause) {
      // Kullanıcı ödeme ekranında vazgeçtiyse hata gösterilmez; seçimleri yerinde kalır.
      if (cause instanceof VadoError && cause.code === "user_denied") return;
      setError(cause instanceof Error ? cause.message : "Randevu alınamadı. Tekrar dene.");
    } finally {
      setBusy(false);
    }
  }

  function share(current: Booking) {
    vado.share
      .open({
        title: `${businessName} randevusu`,
        text: `${businessName}: ${current.dayLabel}, saat ${current.time} için randevu aldım.`,
      })
      .catch(() => {
        // Paylaşım menüsü kapatıldıysa yapılacak bir şey yoktur.
      });
  }

  if (confirmed && booking !== null) {
    return (
      <main className="page">
        <section className="confirmation" aria-live="polite">
          <h1>Randevun alındı</h1>
          <p className="lead">
            {booking.dayLabel}, saat {booking.time}
          </p>
          <dl className="receipt">
            <div>
              <dt>Hizmet</dt>
              <dd>{booking.serviceName}</dd>
            </div>
            <div>
              <dt>Yer</dt>
              <dd>{businessName}</dd>
            </div>
            <div>
              <dt>Ödenen</dt>
              <dd>{formatPrice(booking.amountMinor)}</dd>
            </div>
          </dl>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => {
              share(booking);
            }}
          >
            Randevuyu paylaş
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={() => {
              void vado.container.close();
            }}
          >
            VADO'ya dön
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="intro">
        <h1>{businessName}</h1>
        <p className="lead">
          {firstName === null ? "Merhaba" : `Merhaba ${firstName}`}, ne zaman gelmek istersin?
        </p>
      </header>

      {!insideVado && (
        <p className="notice" role="status">
          Bu sayfa VADO içinde açıldığında çalışır. Burada yalnızca saatlere bakabilirsin.
        </p>
      )}
      {insideVado && merchantId === null && (
        <p className="notice" role="status">
          Bu işletme henüz ödeme alacak şekilde ayarlanmamış; randevu alınamıyor.
        </p>
      )}

      {booking !== null && (
        <section className="upcoming" aria-label="Yaklaşan randevun">
          <h2>Yaklaşan randevun</h2>
          <p>
            {booking.dayLabel}, saat {booking.time}
          </p>
          <p className="hint">{booking.serviceName}</p>
        </section>
      )}

      <fieldset className="group">
        <legend>Hizmet</legend>
        {services.map((item) => (
          <label key={item.id} className="service">
            <input
              type="radio"
              name="service"
              checked={item.id === serviceId}
              onChange={() => {
                setServiceId(item.id);
              }}
            />
            <span className="service-name">
              {item.name}
              <small>{item.durationMinutes} dakika</small>
            </span>
            <span className="service-price">{formatPrice(item.priceMinor)}</span>
          </label>
        ))}
      </fieldset>

      <fieldset className="group">
        <legend>Gün</legend>
        <div className="days">
          {days.map((item) => (
            <button
              key={item.key}
              type="button"
              className="chip"
              aria-pressed={item.key === dayKey}
              onClick={() => {
                setDayKey(item.key);
                setTime(null);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="group">
        <legend>Saat</legend>
        <div className="slots">
          {slots.map((slot) => (
            <button
              key={slot.time}
              type="button"
              className="chip"
              disabled={!slot.available}
              aria-pressed={slot.time === time}
              onClick={() => {
                setTime(slot.time);
              }}
            >
              {slot.time}
            </button>
          ))}
        </div>
        <p className="hint">Üstü çizili saatler dolu.</p>
      </fieldset>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <footer className="checkout">
        <button
          className="button button-primary"
          type="button"
          disabled={!canBook || busy}
          onClick={() => {
            void book();
          }}
        >
          {busy ? (
            "Ödeme bekleniyor…"
          ) : time === null || service === undefined ? (
            "Saat seç"
          ) : (
            <>
              <span>Randevu al</span>
              <span>{formatPrice(service.priceMinor)}</span>
            </>
          )}
        </button>
        <p className="hint">Ödemeyi VADO'nun kendi ekranında onaylarsın.</p>
      </footer>
    </main>
  );
}
