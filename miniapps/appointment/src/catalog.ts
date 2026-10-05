import type { ConfigValues } from "@vado/miniapp-sdk";

export interface Service {
  id: string;
  name: string;
  durationMinutes: number;
  priceMinor: number;
}

/** Bildirim dosyasındaki `services` ayarının her seçeneği için hizmet listesi. */
const SERVICE_LISTS = {
  berber: [
    { id: "sac", name: "Saç kesimi", durationMinutes: 30, priceMinor: 65_000 },
    { id: "sac-sakal", name: "Saç ve sakal", durationMinutes: 45, priceMinor: 85_000 },
    { id: "sakal", name: "Sakal düzeltme", durationMinutes: 20, priceMinor: 30_000 },
  ],
  guzellik: [
    { id: "manikur", name: "Manikür", durationMinutes: 40, priceMinor: 55_000 },
    { id: "cilt", name: "Cilt bakımı", durationMinutes: 60, priceMinor: 120_000 },
    { id: "fon", name: "Fön", durationMinutes: 30, priceMinor: 45_000 },
  ],
} satisfies Record<string, Service[]>;

/**
 * Bu paketi kullanan işletmenin ayarları. Aynı paket her işletmede kendi adı, satıcısı ve hizmet
 * listesiyle açılır; değerler yönetim panelinde, uygulama kaydının ayarlarından girilir.
 */
export interface Settings {
  businessName: string;
  /** Ödemeyi alacak satıcı; VADO dışında açıldığında tanımlı değildir. */
  merchantId: string | null;
  services: Service[];
}

/** VADO dışında (tarayıcıda doğrudan) açıldığında gösterilen örnek ayarlar. */
export const PREVIEW_SETTINGS: Settings = {
  businessName: "Örnek Berber",
  merchantId: null,
  services: SERVICE_LISTS.berber,
};

/** Kabuğun verdiği ayarları okur; eksik ya da beklenmeyen değerde örnek ayara döner. */
export function settingsFrom(config: ConfigValues): Settings {
  const { businessName, merchantId, services } = config;
  const list = typeof services === "string" && Object.hasOwn(SERVICE_LISTS, services);
  return {
    businessName: typeof businessName === "string" ? businessName : PREVIEW_SETTINGS.businessName,
    merchantId: typeof merchantId === "string" ? merchantId : null,
    services: list ? SERVICE_LISTS[services as keyof typeof SERVICE_LISTS] : SERVICE_LISTS.berber,
  };
}

const SLOTS = ["10:00", "11:00", "12:00", "13:00", "14:30", "15:30", "16:30", "18:00"];
const DAY_COUNT = 5;

export interface Day {
  /** YYYY-AA-GG */
  key: string;
  /** Gün seçicide görünen ad: "Bugün", "Yarın" veya tarih. */
  label: string;
  /** Günün tarihi ("4 Eki Paz"). Kaydedilen randevu ve ödeme açıklaması ertesi gün de doğru okunur. */
  dateLabel: string;
}

export interface Slot {
  time: string;
  available: boolean;
}

/** Kaydedilen randevu; cihazdaki mini uygulama depolamasında JSON olarak saklanır. */
export interface Booking {
  serviceName: string;
  dayLabel: string;
  time: string;
  amountMinor: number;
  paymentId: string;
}

const dayFormat = new Intl.DateTimeFormat("tr-TR", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const priceFormat = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });

export function formatPrice(amountMinor: number): string {
  return priceFormat.format(amountMinor / 100);
}

/** Bugünden başlayarak randevu alınabilecek günler. */
export function upcomingDays(today = new Date()): Day[] {
  return Array.from({ length: DAY_COUNT }, (_, offset) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
    const key = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
    const dateLabel = dayFormat.format(date);
    const label = offset === 0 ? "Bugün" : offset === 1 ? "Yarın" : dateLabel;
    return { key, label, dateLabel };
  });
}

/**
 * Örnek uygulamanın sunucusu olmadığı için doluluk, güne ve saate bağlı sabit bir
 * hesapla üretilir: aynı gün her açılışta aynı boş saatleri gösterir.
 */
export function slotsFor(day: Day): Slot[] {
  return SLOTS.map((time) => {
    const text = `${day.key}${time}`;
    let seed = 0;
    for (let index = 0; index < text.length; index += 1) seed += text.charCodeAt(index);
    return { time, available: seed % 4 !== 0 };
  });
}

/** Her randevu denemesi için benzersiz sipariş numarası üretir. */
export function createOrderId(day: Day, time: string): string {
  return `rnd-${day.key}-${time.replace(":", "")}-${Date.now().toString(36)}`;
}

export function parseBooking(value: string | null): Booking | null {
  if (value === null) return null;
  try {
    return JSON.parse(value) as Booking;
  } catch {
    return null;
  }
}
