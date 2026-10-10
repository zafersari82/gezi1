import {
  type BusinessStatus,
  MINI_APP_OFFLINE_REASON_LABELS,
  type MiniAppOfflineReason,
  PACKAGE_VERSION_STATUS_LABELS,
  type PackageFindingLevel,
  type PackageVersionStatus,
  type ReportTargetType,
  type UserStatus,
} from "@vado/contracts";

const TIME_ZONE = "Europe/Istanbul";

const dateTimeFormat = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIME_ZONE,
});
const dateFormat = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});
const numberFormat = new Intl.NumberFormat("tr-TR");

/** Sunucunun saat diliminden bağımsız olarak Türkiye saatiyle yazar: 3 Eki 2026 14:05 */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

const BYTES_PER_KB = 1024;
const sizeFormat = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 });

/** Dosya boyutunu okunur birimle yazar: 67 KB, 1,4 MB. */
export function formatBytes(bytes: number): string {
  if (bytes < BYTES_PER_KB) return `${bytes} bayt`;
  const kilobytes = bytes / BYTES_PER_KB;
  if (kilobytes < BYTES_PER_KB) return `${sizeFormat.format(kilobytes)} KB`;
  return `${sizeFormat.format(kilobytes / BYTES_PER_KB)} MB`;
}

/** Sınırı aşan paket dosyası için gösterilen ileti; tarayıcıda ve sunucuda aynıdır. */
export function packageTooLargeMessage(maxBytes: number): string {
  return `Dosya ${formatBytes(maxBytes)} sınırını aşıyor.`;
}

const DIGEST_PREVIEW_LENGTH = 12;

/** İçerik özetinin tablolarda gösterilen baş kısmı; tamamı sürüm sayfasında yazar. */
export function shortDigest(digest: string): string {
  return digest.slice(0, DIGEST_PREVIEW_LENGTH);
}

export type Tone = "positive" | "warning" | "danger" | "neutral";

export const USER_STATUS: Record<UserStatus, { label: string; tone: Tone }> = {
  active: { label: "Etkin", tone: "positive" },
  suspended: { label: "Askıda", tone: "danger" },
  deleted: { label: "Silinmiş", tone: "neutral" },
};

export const BUSINESS_STATUS: Record<BusinessStatus, { label: string; tone: Tone }> = {
  pending: { label: "Onay bekliyor", tone: "warning" },
  active: { label: "Yayında", tone: "positive" },
  suspended: { label: "Askıda", tone: "danger" },
};

const PACKAGE_STATUS_TONES: Record<PackageVersionStatus, Tone> = {
  draft: "neutral",
  in_review: "warning",
  approved: "positive",
  rejected: "danger",
  withdrawn: "neutral",
  revoked: "danger",
};

export function packageStatus(status: PackageVersionStatus): { label: string; tone: Tone } {
  return { label: PACKAGE_VERSION_STATUS_LABELS[status], tone: PACKAGE_STATUS_TONES[status] };
}

/** Uygulama kaydının kullanıcılara açık olup olmadığı; kapalıysa nedeni. */
export function miniAppStatus(reason: MiniAppOfflineReason | null): { label: string; tone: Tone } {
  if (reason === null) return { label: "Yayında", tone: "positive" };
  const tone: Tone = reason === "unverified" || reason === "unpublished" ? "warning" : "danger";
  return { label: MINI_APP_OFFLINE_REASON_LABELS[reason], tone };
}

export const FINDING_LEVELS: Record<PackageFindingLevel, { label: string; tone: Tone }> = {
  blocked: { label: "Engellenir", tone: "danger" },
  review: { label: "İncele", tone: "warning" },
  info: { label: "Bilgi", tone: "neutral" },
};

export const REPORT_TARGET_LABELS: Record<ReportTargetType, string> = {
  user: "Kullanıcı",
  message: "Mesaj",
  moment: "Paylaşım",
  miniapp: "Mini uygulama",
  business: "İşletme",
  review: "Değerlendirme",
};

/** Denetim kaydındaki kayıt türlerinin okunur karşılıkları; bilinmeyen tür olduğu gibi gösterilir. */
export const AUDIT_TARGET_LABELS: Record<string, string> = {
  user: "Kullanıcı",
  business: "İşletme",
  review: "Değerlendirme",
  miniapp: "Mini uygulama",
  package: "Paket",
  payment: "Ödeme",
  report: "Şikayet",
  admin_account: "Panel hesabı",
  admin_session: "Panel oturumu",
};

/** Denetim kaydındaki işlem adlarının okunur karşılıkları; bilinmeyen ad olduğu gibi gösterilir. */
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "admin.login": "Panele giriş",
  "admin.login_recovery_code": "Panele kurtarma koduyla giriş",
  "admin.login_failed": "Başarısız panel girişi",
  "admin.second_factor_failed": "Hatalı ikinci adım kodu",
  "admin.totp_enabled": "İki adımlı doğrulama kuruldu",
  "admin.totp_reset": "İki adımlı doğrulama sıfırlandı",
  "admin.password_changed": "Parola değiştirildi",
  "admin.password_reset": "Parola sıfırlandı",
  "admin.recovery_codes_regenerated": "Kurtarma kodları yenilendi",
  "admin.session_revoked": "Panel oturumu kapatıldı",
  "admin.account_created": "Panel hesabı açıldı",
  "admin.account_updated": "Panel hesabı güncellendi",
  "admin.role_changed": "Panel hesabının rolü değişti",
  "auth.new_device": "Yeni cihazdan giriş",
  "business.created": "İşletme başvurusu yapıldı",
  "business.updated": "İşletme güncellendi",
  "miniapp.saved": "Mini uygulama kaydedildi",
  "miniapp.updated": "Mini uygulama durumu değişti",
  "miniapp.merchant_saved": "Satıcı eşleştirildi",
  "miniapp.published": "Sürüm yayınlandı",
  "miniapp.rolled_back": "Yayın geri alındı",
  "miniapp.config_saved": "İşletme ayarları değişti",
  "package.saved": "Paket kaydedildi",
  "package.version_uploaded": "Paket sürümü yüklendi",
  "package.version_submitted": "Sürüm incelemeye gönderildi",
  "package.version_resubmitted": "Sürüm yeniden incelemeye gönderildi",
  "package.version_approved": "Sürüm onaylandı",
  "package.version_rejected": "Sürüm reddedildi",
  "package.version_withdrawn": "Sürümden vazgeçildi",
  "package.version_revoked": "Onaylı sürüm geri çekildi",
  "payment.created": "Ödeme oturumu açıldı",
  "payment.confirmed": "Ödeme onaylandı",
  "report.updated": "Şikayet durumu değişti",
  "user.deleted": "Hesap silindi",
  "user.suspended": "Hesap askıya alındı",
  "user.reactivated": "Hesap yeniden açıldı",
};
