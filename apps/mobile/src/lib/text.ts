const FOLD_MAP: Record<string, string> = {
  ç: "c",
  ğ: "g",
  ı: "i",
  ö: "o",
  ş: "s",
  ü: "u",
  â: "a",
  î: "i",
  û: "u",
};

/**
 * Metni aramada karşılaştırmak için sadeleştirir: Türkçeye uygun küçük harfe çevirir
 * ve aksanlı harfleri yalın karşılıklarına indirger. "IŞIK", "Işık" ve "isik" aynı sonucu verir.
 *
 * JavaScript motorlarının yerel ayar desteği cihaza göre değiştiği için dönüşüm elle yapılır.
 */
export function foldText(input: string): string {
  return input
    .replace(/İ/g, "i")
    .replace(/I/g, "ı")
    .toLowerCase()
    .replace(/[çğıöşüâîû]/g, (letter) => FOLD_MAP[letter] ?? letter)
    .trim();
}

/** Türkçeye uygun büyük harf: "i" → "İ", "ı" → "I". */
export function upperCaseTr(input: string): string {
  return input.replace(/i/g, "İ").replace(/ı/g, "I").toUpperCase();
}

/** Addan en fazla iki baş harf üretir: "Ayşe Yılmaz" → "AY", "ilker" → "İ". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
  return upperCaseTr(first + last);
}

/** Metinden kararlı bir sayı üretir; aynı kullanıcıya hep aynı rengi vermek için kullanılır. */
export function hashOf(input: string): number {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) % 2_147_483_647;
  }
  return hash;
}

/** Türkçe alfabe sırasına göre karşılaştırır (ç, ğ, ı, ö, ş, ü doğru yerde sıralanır). */
export function compareTr(a: string, b: string): number {
  return a.localeCompare(b, "tr");
}
