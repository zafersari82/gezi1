"use client";

import {
  type Booking,
  type BookingHours,
  type BookingResource,
  bookingResourceBodySchema,
  bookingResourceSchema,
  bookingSchema,
  type BookingService,
  bookingServiceBodySchema,
  bookingServiceSchema,
  bookingStatusUpdateSchema,
  type Branch,
} from "@vado/contracts";
import { type SyntheticEvent, useState } from "react";
import { z } from "zod";

import { call, errorMessage } from "../lib/client";
import { decimalToMinor, minutesFromTime, money, timeFromMinutes } from "../lib/values";
import { useNow } from "./use-now";

interface BookingSetup {
  services: BookingService[];
  resources: BookingResource[];
  hours: (BookingHours & { resourceId: string })[];
}
const weekdayNames = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];
/** Telefon uyumlu işletme editörü. Çalışan vardiyası ve görev yönetimi değildir. */
export function BookingsView({
  initialSetup,
  initialBookings,
  branches,
}: {
  initialSetup: BookingSetup;
  initialBookings: Booking[];
  branches: Branch[];
}) {
  const [setup, setSetup] = useState(initialSetup);
  const [bookings, setBookings] = useState(initialBookings);
  const [branchId, setBranchId] = useState(branches.find((b) => b.active)?.id ?? "");
  const [serviceName, setServiceName] = useState("");
  const [duration, setDuration] = useState("30");
  const [price, setPrice] = useState("0");
  const [resourceName, setResourceName] = useState("");
  const [resourceId, setResourceId] = useState("");
  const [weekday, setWeekday] = useState(1);
  const [open, setOpen] = useState("09:00");
  const [close, setClose] = useState("18:00");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const now = useNow(60_000);
  const activeResources = setup.resources.filter((item) => item.branchId === branchId);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }
  function addService(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      const body = bookingServiceBodySchema.parse({
        branchId,
        name: serviceName,
        durationMinutes: Number(duration),
        priceMinor: decimalToMinor(price),
        active: true,
      });
      const result = await call(
        bookingServiceSchema,
        "/api/business/bookings/services",
        "POST",
        body,
      );
      setSetup((before) => ({ ...before, services: [...before.services, result] }));
      setServiceName("");
      setNotice("Hizmet eklendi.");
    });
  }
  function addResource(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      const body = bookingResourceBodySchema.parse({ branchId, name: resourceName, active: true });
      const result = await call(
        bookingResourceSchema,
        "/api/business/bookings/resources",
        "POST",
        body,
      );
      setSetup((before) => ({ ...before, resources: [...before.resources, result] }));
      setResourceName("");
      setResourceId(result.id);
      setNotice("Rezerve edilebilir kaynak eklendi.");
    });
  }
  function saveHours(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    void run(async () => {
      if (resourceId === "") throw new Error("Önce bir kaynak seç.");
      const retained = setup.hours
        .filter((h) => h.resourceId === resourceId && h.weekday !== weekday)
        .map(({ weekday, opensAt, closesAt }) => ({ weekday, opensAt, closesAt }));
      const next = [
        ...retained,
        { weekday, opensAt: minutesFromTime(open), closesAt: minutesFromTime(close) },
      ];
      await call(
        z.object({ ok: z.boolean() }),
        `/api/business/bookings/resources/${resourceId}/hours`,
        "PUT",
        { hours: next },
      );
      setSetup((before) => ({
        ...before,
        hours: [
          ...before.hours.filter((h) => h.resourceId !== resourceId),
          ...next.map((h) => ({ ...h, resourceId })),
        ],
      }));
      setNotice("Kaynak takvimi kaydedildi.");
    });
  }
  function closeDay() {
    void run(async () => {
      if (resourceId === "") return;
      const retained = setup.hours
        .filter((h) => h.resourceId === resourceId && h.weekday !== weekday)
        .map(({ weekday, opensAt, closesAt }) => ({ weekday, opensAt, closesAt }));
      await call(
        z.object({ ok: z.boolean() }),
        `/api/business/bookings/resources/${resourceId}/hours`,
        "PUT",
        { hours: retained },
      );
      setSetup((before) => ({
        ...before,
        hours: before.hours.filter((h) => h.resourceId !== resourceId || h.weekday !== weekday),
      }));
      setNotice("Bu gün rezervasyona kapatıldı.");
    });
  }
  function changeService(service: BookingService) {
    void run(async () => {
      const body = bookingServiceBodySchema.parse({
        branchId: service.branchId,
        name: service.name,
        durationMinutes: service.durationMinutes,
        priceMinor: service.priceMinor,
        active: !service.active,
      });
      const updated = await call(
        bookingServiceSchema,
        `/api/business/bookings/services/${service.id}`,
        "PUT",
        body,
      );
      setSetup((before) => ({
        ...before,
        services: before.services.map((s) => (s.id === service.id ? updated : s)),
      }));
    });
  }
  function changeResource(resource: BookingResource) {
    void run(async () => {
      const body = bookingResourceBodySchema.parse({
        branchId: resource.branchId,
        name: resource.name,
        active: !resource.active,
      });
      const updated = await call(
        bookingResourceSchema,
        `/api/business/bookings/resources/${resource.id}`,
        "PUT",
        body,
      );
      setSetup((before) => ({
        ...before,
        resources: before.resources.map((r) => (r.id === resource.id ? updated : r)),
      }));
    });
  }
  function updateStatus(booking: Booking, status: "cancelled" | "completed") {
    void run(async () => {
      const body = bookingStatusUpdateSchema.parse({ status, expectedVersion: booking.version });
      const updated = await call(
        bookingSchema,
        `/api/business/bookings/${booking.id}/status`,
        "PUT",
        body,
      );
      setBookings((before) => before.map((entry) => (entry.id === booking.id ? updated : entry)));
      setNotice("Rezervasyon güncellendi.");
    });
  }
  return (
    <div className="channel-editor">
      {error && (
        <p role="alert" className="channel-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="channel-notice">
          {notice}
        </p>
      )}
      <section>
        <h2>Şube ve hizmetler</h2>
        <label htmlFor="booking-branch">Şube</label>
        <select
          id="booking-branch"
          value={branchId}
          onChange={(e) => {
            setBranchId(e.target.value);
            setResourceId("");
          }}
        >
          {branches
            .filter((b) => b.active)
            .map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
        </select>
        {branchId === "" && <p className="muted">Önce Şubeler bölümünden etkin şube oluştur.</p>}
        <form onSubmit={addService}>
          <h3>Yeni hizmet</h3>
          <label>
            Hizmet adı
            <input
              required
              maxLength={90}
              value={serviceName}
              onChange={(e) => {
                setServiceName(e.target.value);
              }}
              placeholder="Saç kesimi"
            />
          </label>
          <label>
            Süre (dakika)
            <input
              required
              type="number"
              min="15"
              max="240"
              step="15"
              value={duration}
              onChange={(e) => {
                setDuration(e.target.value);
              }}
            />
          </label>
          <label>
            Ücret (₺)
            <input
              required
              inputMode="decimal"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
              }}
            />
          </label>
          <button className="primary-button" disabled={busy || branchId === ""}>
            Hizmet ekle
          </button>
        </form>
        <ul className="channel-posts">
          {setup.services
            .filter((s) => s.branchId === branchId)
            .map((s) => (
              <li key={s.id}>
                <strong>{s.name}</strong> · {s.durationMinutes} dk · {money(s.priceMinor)}
                <button
                  disabled={busy}
                  onClick={() => {
                    changeService(s);
                  }}
                >
                  {s.active ? "Yayından kaldır" : "Etkinleştir"}
                </button>
              </li>
            ))}
        </ul>
      </section>
      <section>
        <h2>Randevu kaynakları</h2>
        <p className="muted">
          Bir berber koltuğu, hizmet odası veya uzman tanımla. Çalışan vardiyası planlaması
          yapılmaz.
        </p>
        <form onSubmit={addResource}>
          <label>
            Kaynak adı
            <input
              required
              maxLength={80}
              value={resourceName}
              onChange={(e) => {
                setResourceName(e.target.value);
              }}
              placeholder="1. koltuk / Uzman A"
            />
          </label>
          <button className="primary-button" disabled={busy || branchId === ""}>
            Kaynak ekle
          </button>
        </form>
        <ul className="channel-posts">
          {activeResources.map((r) => (
            <li key={r.id}>
              <strong>{r.name}</strong>
              <button
                disabled={busy}
                onClick={() => {
                  changeResource(r);
                }}
              >
                {r.active ? "Pasifleştir" : "Etkinleştir"}
              </button>
            </li>
          ))}
        </ul>
        <form onSubmit={saveHours}>
          <h3>Haftalık uygunluk</h3>
          <label>
            Kaynak
            <select
              value={resourceId}
              onChange={(e) => {
                setResourceId(e.target.value);
              }}
            >
              <option value="">Seç</option>
              {activeResources
                .filter((r) => r.active)
                .map((r) => (
                  <option value={r.id} key={r.id}>
                    {r.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Gün
            <select
              value={weekday}
              onChange={(e) => {
                setWeekday(Number(e.target.value));
              }}
            >
              {weekdayNames.map((name, index) => (
                <option value={index} key={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Başlangıç
            <input
              type="time"
              step="900"
              value={open}
              onChange={(e) => {
                setOpen(e.target.value);
              }}
            />
          </label>
          <label>
            Bitiş
            <input
              type="time"
              step="900"
              value={close}
              onChange={(e) => {
                setClose(e.target.value);
              }}
            />
          </label>
          <button className="primary-button" disabled={busy || resourceId === ""}>
            Bu günün saatlerini kaydet
          </button>
        </form>
        <button type="button" disabled={busy || resourceId === ""} onClick={closeDay}>
          Seçili günü randevuya kapat
        </button>
        {resourceId !== "" && (
          <p className="muted">
            {setup.hours
              .filter((h) => h.resourceId === resourceId)
              .map(
                (h) =>
                  `${weekdayNames[h.weekday]}: ${timeFromMinutes(h.opensAt)}–${timeFromMinutes(h.closesAt)}`,
              )
              .join(" · ") || "Henüz uygun saat yok."}
          </p>
        )}
      </section>
      <section>
        <h2>Gelen randevular</h2>
        {bookings.length === 0 && <p className="muted">Henüz randevu alınmadı.</p>}
        <ul className="channel-posts">
          {bookings.map((booking) => (
            <li key={booking.id}>
              <strong>{booking.serviceName}</strong> · {booking.resourceName}
              <p>{new Date(booking.startsAt).toLocaleString("tr-TR")}</p>
              <p>
                {money(booking.priceMinor)} ·{" "}
                {booking.status === "confirmed"
                  ? "Onaylandı"
                  : booking.status === "cancelled"
                    ? "İptal"
                    : "Tamamlandı"}
              </p>
              {booking.status === "confirmed" && (
                <>
                  <button
                    disabled={busy}
                    onClick={() => {
                      updateStatus(booking, "cancelled");
                    }}
                  >
                    İptal et
                  </button>
                  <button
                    disabled={busy || new Date(booking.startsAt).getTime() > now}
                    onClick={() => {
                      updateStatus(booking, "completed");
                    }}
                  >
                    Tamamlandı
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
