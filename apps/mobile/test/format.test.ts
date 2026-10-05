import { describe, expect, it } from "vitest";

import {
  formatChatStamp,
  formatCountdown,
  formatDayLabel,
  formatListTime,
  formatMoney,
  isSameDay,
} from "@/lib/format";

/** Cihazın saat diliminde verilen tarihi ISO metnine çevirir; testler saat diliminden etkilenmez. */
const at = (year: number, month: number, day: number, hour = 12, minute = 0) =>
  new Date(year, month - 1, day, hour, minute).toISOString();

// 3 Ekim 2026 Cumartesi, 15:30
const now = new Date(2026, 9, 3, 15, 30);

describe("formatListTime", () => {
  it("bugünün mesajında saati gösterir", () => {
    expect(formatListTime(at(2026, 10, 3, 9, 5), now)).toBe("09:05");
  });

  it("dünün mesajında gece yarısını geçmiş olsa bile Dün yazar", () => {
    expect(formatListTime(at(2026, 10, 2, 23, 59), now)).toBe("Dün");
  });

  it("son bir haftada gün adını, daha eskisinde tarihi gösterir", () => {
    expect(formatListTime(at(2026, 9, 30), now)).toBe("Çarşamba");
    expect(formatListTime(at(2026, 9, 20), now)).toBe("20 Eyl");
  });
});

describe("formatDayLabel", () => {
  it("bugün, dün ve daha eski günleri ayırır", () => {
    expect(formatDayLabel(at(2026, 10, 3, 0, 1), now)).toBe("Bugün");
    expect(formatDayLabel(at(2026, 10, 2), now)).toBe("Dün");
    expect(formatDayLabel(at(2026, 8, 30), now)).toBe("30 Ağustos 2026");
  });
});

describe("formatChatStamp", () => {
  it("güne göre saatin önüne açıklama ekler", () => {
    expect(formatChatStamp(at(2026, 10, 3, 14, 5), now)).toBe("14:05");
    expect(formatChatStamp(at(2026, 10, 2, 14, 5), now)).toBe("Dün 14:05");
    expect(formatChatStamp(at(2026, 9, 29, 8, 0), now)).toBe("Salı 08:00");
    expect(formatChatStamp(at(2026, 9, 1, 8, 0), now)).toBe("1 Eyl 08:00");
  });
});

describe("isSameDay", () => {
  it("takvim gününe bakar", () => {
    expect(isSameDay(at(2026, 10, 3, 0, 0), at(2026, 10, 3, 23, 59))).toBe(true);
    expect(isSameDay(at(2026, 10, 3, 23, 59), at(2026, 10, 4, 0, 0))).toBe(false);
  });
});

describe("formatMoney", () => {
  it("kuruşu Türk lirası olarak yazar", () => {
    expect(formatMoney(65_000)).toBe("₺650,00");
    expect(formatMoney(123_456_789)).toBe("₺1.234.567,89");
    expect(formatMoney(5)).toBe("₺0,05");
  });
});

describe("formatCountdown", () => {
  it("dakika ve saniyeyi ayırır, eksi değerleri sıfıra çeker", () => {
    expect(formatCountdown(125)).toBe("2:05");
    expect(formatCountdown(59.9)).toBe("0:59");
    expect(formatCountdown(-3)).toBe("0:00");
  });
});
