import { ERROR_MESSAGES, HTTP_STATUS_CODES, type ErrorCode } from "@vado/contracts";

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
    this.statusCode = HTTP_STATUS_CODES[code];
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
