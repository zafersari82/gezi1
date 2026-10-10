import { z } from "zod";

/**
 * Bir mini uygulamanın VADO kabuğundan isteyebileceği yetkiler.
 * Mini uygulama yalnızca yönetim panelinde onaylanmış yetkilerini kullanabilir.
 */
export const CAPABILITIES = [
  "identity.basic",
  "camera.qr",
  "location.coarse",
  "location.catalog",
  "location.addresses",
  "payment.request",
  "storage.local",
  "share.native",
  "ordering.basic",
  "incentives.basic",
] as const;

export const capabilitySchema = z.enum(CAPABILITIES);
export type Capability = z.infer<typeof capabilitySchema>;

/** Onay ekranında ve yönetim panelinde gösterilen açıklamalar. */
export const CAPABILITY_LABELS: Record<Capability, string> = {
  "identity.basic": "Adını ve profil fotoğrafını görme",
  "camera.qr": "QR kod okutmak için kamerayı kullanma",
  "location.coarse": "Yaklaşık konumunu öğrenme",
  "location.catalog": "Ülke, il, ilçe ve mahalle kataloğunu okuma",
  "location.addresses": "Teslimat adreslerini, alıcı ve telefon bilgilerini görme ve yönetme",
  "payment.request": "VADO ödeme ekranını açma",
  "storage.local": "Bu cihazda kendi verisini saklama",
  "share.native": "Telefonun paylaşım menüsünü açma",
  "incentives.basic": "Bu işletmedeki kampanya, kupon ve sadakat puanını yönetme",
  "ordering.basic": "Bu işletmedeki sepetini ve siparişlerini yönetme",
};

/**
 * Kullanıcıdan bir kez onay istenen yetkiler. Onay cihazda saklanır ve ayarlardan geri alınabilir.
 * Ödeme her seferinde ödeme ekranında onaylanır; depolama ve paylaşım onay gerektirmez.
 */
export const CONSENT_CAPABILITIES = [
  "identity.basic",
  "camera.qr",
  "location.coarse",
  "location.addresses",
] as const satisfies readonly Capability[];
export type ConsentCapability = (typeof CONSENT_CAPABILITIES)[number];

export function requiresConsent(capability: Capability): capability is ConsentCapability {
  return (CONSENT_CAPABILITIES as readonly Capability[]).includes(capability);
}
