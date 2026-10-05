const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const TURKISH_MOBILE_PATTERN = /^\+905\d{9}$/;

/**
 * Telefon numarasını E.164 biçimine getirir; geçersizse `null` döner.
 *
 * Türkiye'de numara "0555 123 45 67", "555 123 45 67" veya "90 555 123 45 67"
 * biçimlerinde yazılabildiği için ülke kodu verilmemiş numaralar +90 kabul edilir.
 * SMS kodu yalnızca cep telefonuna gidebildiğinden +90 numaraların 5 ile başlaması gerekir.
 */
export function normalizePhone(input: string): string | null {
  const compact = input.trim().replace(/[\s().-]/g, "");
  if (compact === "") return null;

  let candidate = compact.startsWith("00") ? `+${compact.slice(2)}` : compact;
  if (!candidate.startsWith("+")) {
    if (/^0\d{10}$/.test(candidate)) candidate = `+90${candidate.slice(1)}`;
    else if (/^\d{10}$/.test(candidate)) candidate = `+90${candidate}`;
    else candidate = `+${candidate}`;
  }

  if (!E164_PATTERN.test(candidate)) return null;
  if (candidate.startsWith("+90") && !TURKISH_MOBILE_PATTERN.test(candidate)) return null;
  return candidate;
}

/** E.164 numarayı okunur biçimde gösterir: +90 555 123 45 67. */
export function formatPhone(phone: string): string {
  const match = /^\+90(\d{3})(\d{3})(\d{2})(\d{2})$/.exec(phone);
  if (!match) return phone;
  return `+90 ${match[1]} ${match[2]} ${match[3]} ${match[4]}`;
}
