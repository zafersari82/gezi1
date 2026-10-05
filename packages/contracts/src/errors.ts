import { z } from "zod";

/**
 * API'nin döndürebileceği tüm hata kodları ve kullanıcıya gösterilecek Türkçe karşılıkları.
 * Yeni bir hata eklemek için yalnızca bu tabloya satır eklenir.
 */
export const ERROR_MESSAGES = {
  // Genel
  validation_failed: "Gönderilen bilgiler geçersiz.",
  unauthorized: "Oturumun sona erdi. Lütfen yeniden giriş yap.",
  forbidden: "Bu işlem için yetkin yok.",
  not_found: "Aradığın kayıt bulunamadı.",
  rate_limited: "Çok fazla istek gönderildi. Biraz sonra tekrar dene.",
  internal_error: "Beklenmeyen bir hata oluştu. Lütfen tekrar dene.",

  // Kimlik doğrulama
  invalid_phone: "Telefon numarası geçersiz.",
  otp_cooldown: "Yeni kod istemek için biraz beklemelisin.",
  otp_rate_limited: "Çok fazla kod istendi. Bir süre sonra tekrar dene.",
  otp_invalid: "Kod hatalı veya süresi dolmuş.",
  otp_locked: "Çok fazla hatalı deneme yapıldı. Yeni bir kod iste.",
  terms_not_accepted: "Devam etmek için koşulları kabul etmelisin.",
  account_suspended: "Hesabın askıya alınmış. Destek ile iletişime geç.",
  session_not_found: "Oturum bulunamadı.",
  verification_required: "Bu işlem için kimliğini yeniden doğrulaman gerekiyor.",
  device_key_rejected: "Bu cihazda hızlı doğrulama kullanılamıyor. SMS koduyla doğrula.",

  // Kullanıcılar ve kişiler
  username_taken: "Bu VADO kimliği başka biri tarafından kullanılıyor.",
  user_not_found: "Kullanıcı bulunamadı.",
  user_unavailable: "Bu kullanıcıyla şu anda etkileşim kurulamıyor.",
  cannot_target_self: "Bu işlemi kendi hesabın için yapamazsın.",
  already_contacts: "Bu kişi zaten kişilerinde.",
  contact_request_not_found: "Kişi isteği bulunamadı.",
  not_contacts: "Bu işlem için kişilerinde olması gerekir.",

  // Sohbet
  conversation_not_found: "Sohbet bulunamadı.",
  not_group_owner: "Bu işlemi yalnızca grup yöneticisi yapabilir.",
  group_only: "Bu işlem yalnızca gruplarda yapılabilir.",
  group_full: "Grup üye sınırına ulaşıldı.",

  // Medya
  media_invalid: "Yalnızca JPEG, PNG veya WebP görsel yüklenebilir.",
  media_too_large: "Görsel boyutu çok büyük.",
  media_not_found: "Görsel bulunamadı.",

  // Anlar
  moment_not_found: "Paylaşım bulunamadı.",
  moment_empty: "Paylaşım için bir metin veya görsel ekle.",

  // QR
  qr_invalid: "QR kodu tanınmadı.",
  qr_expired: "QR kodunun süresi dolmuş.",
  qr_target_unavailable: "QR kodunun gösterdiği kayıt artık kullanılamıyor.",

  // İşletmeler ve mini uygulamalar
  business_not_found: "İşletme bulunamadı.",
  business_owner_unavailable:
    "İşletmenin sahibi olan hesap etkin olmadığı için işletme yayınlanamaz.",
  slug_taken: "Bu işletme adresi kullanılıyor.",
  miniapp_not_found: "Mini uygulama bulunamadı.",
  miniapp_origin_invalid: "Mini uygulama adresi izin verilen kaynaklarla eşleşmiyor.",
  miniapp_url_mode_disabled:
    "Adresle açılan mini uygulamalar yalnızca geliştirme ortamında kullanılabilir.",
  miniapp_source_fixed: "Paketle yayınlanan bir kayıt, adresle açılan kayda çevrilemez.",
  miniapp_version_not_approved: "Yalnızca onaylı bir paket sürümü yayınlanabilir.",
  miniapp_package_mismatch: "Bu uygulama kaydı başka bir pakete bağlı.",
  miniapp_config_invalid: "Ayarlar, paketin beklediği alanlarla eşleşmiyor.",
  miniapp_no_previous_release: "Geri dönülebilecek önceki bir yayın yok.",

  // Paketler
  package_not_found: "Paket bulunamadı.",
  package_version_not_found: "Paket sürümü bulunamadı.",
  package_invalid: "Paket kurallara uymuyor.",
  package_too_large: "Paket boyutu sınırı aşıyor.",
  package_version_exists:
    "Bu sürüm numarası daha önce yüklenmiş. Yüklenen sürüm değiştirilemez; yeni bir sürüm numarası kullan.",
  package_version_not_newer: "Sürüm numarası, daha önce yüklenen sürümlerden büyük olmalı.",
  package_state_invalid: "Paket sürümü bu işlem için uygun durumda değil.",
  package_integrity_failed: "Paket dosyası kayıtlı özetiyle eşleşmiyor.",
  package_self_review:
    "Bir sürümü yükleyen ya da incelemeye gönderen hesap o sürümü onaylayamaz. Onayı başka bir hesap vermeli.",
  package_resubmit_required:
    "Bu sürüm 2.4'ten önce incelemeye gönderildi. Onaylanmadan önce bir hesabın onu yeniden incelemeye göndermesi gerekir.",

  // Ödemeler
  payment_not_allowed: "Bu mini uygulamanın ödeme alma yetkisi yok.",
  merchant_not_bound: "Satıcı bu mini uygulamaya bağlı değil.",
  payment_not_found: "Ödeme bulunamadı.",
  payment_state_invalid: "Ödeme bu işlem için uygun durumda değil.",
  payment_expired: "Ödeme oturumunun süresi dolmuş.",
  payment_provider_unavailable: "Ödeme sağlayıcısı henüz yapılandırılmamış.",

  // Yönetim
  admin_unauthorized: "Yönetici anahtarı geçersiz.",
  admin_login_failed:
    "Kullanıcı adı ya da parola hatalı. Çok sayıda hatalı denemeden sonra hesap bir süre kilitlenir.",
  admin_session_invalid: "Panel oturumun sona erdi. Yeniden giriş yap.",
  admin_second_factor_invalid: "Kod hatalı ya da kullanılmış. Uygulamadaki güncel kodu gir.",
  admin_password_change_required: "Devam etmeden önce parolanı değiştirmelisin.",
  admin_password_invalid: "Mevcut parolan hatalı.",
  admin_password_reused: "Yeni parola eskisiyle aynı olamaz.",
  admin_totp_already_enabled: "İki adımlı doğrulama bu hesapta zaten kurulu.",
  admin_username_taken: "Bu kullanıcı adı başka bir hesapta kullanılıyor.",
  admin_account_not_found: "Yönetici hesabı bulunamadı.",
  admin_last_owner: "En az bir etkin sahip hesabı kalmalı.",
  admin_scope_change_forbidden:
    "İşletme hesabının rolü değiştirilemez, bir hesap da işletme hesabına çevrilemez. Hesabı kapatıp yenisini aç.",
  report_not_found: "Şikayet bulunamadı.",
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

export const ERROR_CODES = Object.keys(ERROR_MESSAGES) as ErrorCode[];

export const apiErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && Object.hasOwn(ERROR_MESSAGES, value);
}
