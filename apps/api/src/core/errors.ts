import { ERROR_MESSAGES, type ErrorCode } from "@vado/contracts";

/** Her hata kodunun HTTP durum kodu. Yeni kod eklendiğinde derleyici bu tablonun güncellenmesini ister. */
const STATUS_CODES: Record<ErrorCode, number> = {
  validation_failed: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  rate_limited: 429,
  internal_error: 500,

  invalid_phone: 400,
  otp_cooldown: 429,
  otp_rate_limited: 429,
  otp_invalid: 400,
  otp_locked: 429,
  terms_not_accepted: 400,
  account_suspended: 403,
  session_not_found: 404,
  verification_required: 403,
  device_key_rejected: 403,

  username_taken: 409,
  user_not_found: 404,
  user_unavailable: 403,
  cannot_target_self: 400,
  already_contacts: 409,
  contact_request_not_found: 404,
  not_contacts: 403,

  conversation_not_found: 404,
  not_group_owner: 403,
  group_only: 400,
  group_full: 409,

  media_invalid: 400,
  media_too_large: 413,
  media_not_found: 404,

  moment_not_found: 404,
  moment_empty: 400,

  qr_invalid: 400,
  qr_expired: 400,
  qr_target_unavailable: 404,

  business_not_found: 404,
  business_owner_unavailable: 409,
  slug_taken: 409,
  miniapp_not_found: 404,
  miniapp_origin_invalid: 400,
  miniapp_url_mode_disabled: 403,
  miniapp_source_fixed: 409,
  miniapp_version_not_approved: 409,
  miniapp_package_mismatch: 409,
  miniapp_config_invalid: 400,
  miniapp_no_previous_release: 409,

  package_not_found: 404,
  package_version_not_found: 404,
  package_invalid: 400,
  package_too_large: 413,
  package_version_exists: 409,
  package_version_not_newer: 409,
  package_state_invalid: 409,
  package_integrity_failed: 500,
  package_self_review: 409,
  package_resubmit_required: 409,

  payment_not_allowed: 403,
  merchant_not_bound: 403,
  payment_not_found: 404,
  payment_state_invalid: 409,
  payment_expired: 409,
  payment_provider_unavailable: 501,

  admin_unauthorized: 401,
  admin_login_failed: 401,
  admin_session_invalid: 401,
  admin_second_factor_invalid: 401,
  admin_password_change_required: 403,
  admin_password_invalid: 400,
  admin_password_reused: 400,
  admin_totp_already_enabled: 409,
  admin_username_taken: 409,
  admin_scope_change_forbidden: 409,
  admin_account_not_found: 404,
  admin_last_owner: 409,
  report_not_found: 404,
};

/**
 * İstemciye bilinçli olarak döndürülen hata. Servisler iş kuralı ihlallerinde bunu fırlatır;
 * HTTP katmanı durum kodunu ve Türkçe iletiyi sözleşme tablosundan alır.
 */
export class AppError extends Error {
  readonly statusCode: number;

  constructor(
    readonly code: ErrorCode,
    readonly details?: unknown,
  ) {
    super(ERROR_MESSAGES[code]);
    this.name = "AppError";
    this.statusCode = STATUS_CODES[code];
  }
}

/**
 * Sunucuyu çalıştıran kişiye yönelik başlangıç hatası (eksik ayar, uygulanmamış şema).
 * Yığın izi yerine yalnızca iletisi gösterilir.
 */
export class StartupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StartupError";
  }
}
