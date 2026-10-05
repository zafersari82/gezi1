import { CONSENT_CAPABILITIES, type ConsentCapability } from "@vado/contracts";

/**
 * Kullanıcının bir mini uygulamaya verdiği kalıcı izinler. İzinler, verildikleri andaki izin
 * özetiyle (`consentKey`) birlikte saklanır: mini uygulamanın yetkileri ya da bağlandığı adresler
 * değişince özet de değişir ve eski izinler geçersiz sayılıp yeniden sorulur.
 */
export interface ConsentRecord {
  key: string;
  granted: ConsentCapability[];
}

/** Mini uygulama kimliği → o uygulamaya verilen izinler. */
export type ConsentMap = Record<string, ConsentRecord>;

/** İzin sorulan mini uygulama: kimliği ve güncel izin özeti. */
export interface ConsentSubject {
  id: string;
  consentKey: string;
}

/**
 * - `granted`: izin verilmiş ve hâlâ geçerli.
 * - `outdated`: izin verilmişti, ama mini uygulama o günden beri değişti; yeniden sorulur.
 * - `missing`: izin hiç verilmemiş ya da geri alınmış.
 */
export type ConsentStatus = "granted" | "outdated" | "missing";

function isConsentCapability(value: unknown): value is ConsentCapability {
  return (CONSENT_CAPABILITIES as readonly unknown[]).includes(value);
}

function toRecord(value: unknown): ConsentRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const { key, granted } = value as Record<string, unknown>;
  if (typeof key !== "string" || !Array.isArray(granted)) return null;
  const capabilities = granted.filter(isConsentCapability);
  return capabilities.length > 0 ? { key, granted: capabilities } : null;
}

/**
 * Saklanan izinleri çözer. Tanınmayan kayıtlar atlanır: 2.2 ve öncesinin özetsiz kayıtları da
 * böylece geçersiz kalır ve izinler yeniden sorulur.
 */
export function parseConsents(raw: string | null): ConsentMap {
  if (raw === null) return {};
  let stored: unknown;
  try {
    stored = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof stored !== "object" || stored === null || Array.isArray(stored)) return {};

  const consents: ConsentMap = {};
  for (const [miniAppId, value] of Object.entries(stored)) {
    const record = toRecord(value);
    if (record !== null) consents[miniAppId] = record;
  }
  return consents;
}

export function consentStatus(
  consents: ConsentMap,
  subject: ConsentSubject,
  capability: ConsentCapability,
): ConsentStatus {
  const record = consents[subject.id];
  if (record?.granted.includes(capability) !== true) return "missing";
  return record.key === subject.consentKey ? "granted" : "outdated";
}

/** İzni ekler. Eski bir özetle verilmiş izinler taşınmaz; her biri kullanılacağı zaman sorulur. */
export function withConsent(
  consents: ConsentMap,
  subject: ConsentSubject,
  capability: ConsentCapability,
): ConsentMap {
  const record = consents[subject.id];
  const current = record?.key === subject.consentKey ? record.granted : [];
  const granted = [...new Set([...current, capability])];
  return { ...consents, [subject.id]: { key: subject.consentKey, granted } };
}

/** İzni geri alır; hiç izni kalmayan mini uygulama kayıttan tamamen çıkarılır. */
export function withoutConsent(
  consents: ConsentMap,
  miniAppId: string,
  capability: ConsentCapability,
): ConsentMap {
  const record = consents[miniAppId];
  if (record === undefined) return consents;
  const granted = record.granted.filter((item) => item !== capability);
  const others = Object.entries(consents).filter(([id]) => id !== miniAppId);
  return Object.fromEntries(
    granted.length > 0 ? [...others, [miniAppId, { ...record, granted }]] : others,
  );
}
