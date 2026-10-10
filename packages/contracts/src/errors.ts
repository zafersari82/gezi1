import { z } from "zod";

/**
 * API'nin döndürebileceği tüm hata kodları ve kullanıcıya gösterilecek Türkçe karşılıkları.
 * Yeni bir hata eklemek için yalnızca bu tabloya satır eklenir.
 */
export const ERROR_MESSAGES = {
  incentive_code_taken: "Bu kupon kodu zaten kullanılıyor. Başka bir kod seç.",
  incentive_unavailable: "Kupon veya kampanya artık uygun değil. Sepeti yenile.",
  incentive_stack_forbidden: "Bu kampanya kuponla birlikte kullanılamaz.",
  loyalty_insufficient: "Kullanılabilir sadakat puanın yeterli değil.",
  courier_busy: "Kuryenin etkin bir işi var. Başka bir kurye seçin.",
  location_catalog_not_ready:
    "Adres kataloğu henüz hazır değil. Kurulumda konum kataloğu içe aktarılmalıdır.",
  location_parent_invalid: "Adresin il, ilçe ve mahalle seçimi uyuşmuyor.",
  record_version_conflict: "Kayıt değişti. Güncel bilgiyi açıp yeniden dene.",
  review_exists: "Bu sipariş için zaten bir değerlendirme var.",
  review_order_invalid: "Yalnız tamamlanmış sipariş değerlendirilebilir.",
  location_version_conflict: "Adres veya bölge değişti. Güncel kaydı aç.",
  location_inactive: "Bu adres veya bölge artık etkin değil.",
  table_in_use: "Masada açık veya ödenmemiş sipariş var; oturum kapatılamaz.",
  branch_closed: "Şube şu anda kapalı; sipariş verilemez.",
  fulfilment_unavailable: "Bu masa veya teslim saati artık uygun değil. Yeniden seçin.",
  table_session_closed: "Masa oturumu kapandı. Görevliye başvurun.",
  order_decision_required: "Siparişi kabul ederken süre, reddederken gerekçe gereklidir.",
  payment_version_conflict: "Ödeme bilgisi değişti. Güncel hesabı yükleyin.",
  capability_in_use: "Aktif sipariş, masa veya cihaz varken paket kapatılamaz.",
  settings_version_conflict: "Ayarlar değişti. Güncel değerleri yükleyip yeniden deneyin.",
  // Genel
  validation_failed: "Gönderilen bilgiler geçersiz.",
  unauthorized: "Oturumun sona erdi. Lütfen yeniden giriş yap.",
  forbidden: "Bu işlem için yetkin yok.",
  not_found: "Aradığın kayıt bulunamadı.",
  rate_limited: "Çok fazla istek gönderildi. Biraz sonra tekrar dene.",
  internal_error: "Beklenmeyen bir hata oluştu. Lütfen tekrar dene.",
  idempotency_conflict:
    "Bu tekrar anahtarı başka bilgilerle kullanılmış. Yeni bir anahtarla tekrar dene.",

  cart_version_conflict: "Sepetin başka bir cihazda değişti. Güncel sepeti kontrol et.",
  cart_changed: "Ürün veya fiyat değişti. Güncel sepeti kontrol edip yeniden onayla.",
  cart_expired: "Sepetinin süresi doldu. Yeni bir sepet oluştur.",
  cart_closed: "Bu sepet siparişe dönüştürüldü.",
  order_version_conflict: "Sipariş başka bir cihazda değişti. Güncel durumu kontrol et.",
  order_state_invalid: "Siparişin mevcut durumunda bu işlem yapılamaz.",

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
  media_quota_exceeded: "İşletmenin görsel depolama alanı doldu. Kullanılmayan fotoğrafları temizleyin.",
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
