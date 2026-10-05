import type { TextStyle } from "react-native";

/**
 * VADO görsel dilinin tek kaynağı. Ekranlar renk, boşluk veya yazı boyutunu
 * doğrudan yazmaz; buradaki adları kullanır.
 */
export const colors = {
  /** Marka rengi: birincil eylemler, kendi mesaj balonu, etkin sekme. */
  teal: "#155E63",
  /** Basılı durum ve koyu zeminler. */
  tealDeep: "#0E4347",
  /** Seçili öğe ve vurgu zemini. */
  tealSoft: "#DCEFEC",
  surface: "#FFFFFF",
  /** Gruplanmış içerik ve sohbet zemini. */
  mist: "#F2F5F5",
  line: "#E3E9E8",
  ink: "#152524",
  muted: "#5E6F6E",
  /** Yer tutucu metin ve pasif simgeler. */
  faint: "#93A3A1",
  /** Dikkat rengi: okunmamış rozeti, beğeni, geri alınamaz eylemler. */
  coral: "#D2382B",
  coralSoft: "#FBE9E6",
  /** Deneme ödemesi ve uyarı etiketleri. */
  amber: "#8A5A00",
  amberSoft: "#FFF1CC",
  white: "#FFFFFF",
  /** Tam ekran görsel ve kamera zemini. */
  black: "#000000",
  overlay: "rgba(21, 37, 36, 0.5)",
} as const;

export type ColorName = keyof typeof colors;

/** İznik çinisi paletinden yardımcı renkler: simge kutuları ve baş harfli profil resimleri. */
export const accents = {
  teal: "#155E63",
  cobalt: "#27408B",
  turquoise: "#1B8A8F",
  emerald: "#2F7D4F",
  brick: "#B5472F",
  plum: "#7A3E6B",
  ochre: "#9A6A14",
} as const;

export type AccentName = keyof typeof accents;

/** Metinden (ad, kimlik) kararlı biçimde seçilen yardımcı renk. */
export function accentFor(seed: number): string {
  const palette = Object.values(accents);
  return palette[seed % palette.length] ?? accents.teal;
}

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/** Dokunma hedeflerinin en küçük boyutu. */
export const TOUCH_TARGET = 44;

export const typography = {
  title: { fontSize: 28, lineHeight: 34, fontWeight: "800" },
  heading: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  subheading: { fontSize: 17, lineHeight: 24, fontWeight: "600" },
  body: { fontSize: 16, lineHeight: 22, fontWeight: "400" },
  bodyStrong: { fontSize: 16, lineHeight: 22, fontWeight: "600" },
  callout: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "400" },
  micro: { fontSize: 11, lineHeight: 14, fontWeight: "600" },
} as const satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof typography;
