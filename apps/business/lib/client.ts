import { apiErrorBodySchema, ERROR_MESSAGES, isErrorCode } from "@vado/contracts";
import { z } from "zod";

export class ClientApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}
export async function call<Schema extends z.ZodType>(
  schema: Schema,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<z.infer<Schema>> {
  const response = await fetch(path, {
    method,
    cache: "no-store",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value: unknown = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    const result = apiErrorBodySchema.safeParse(value);
    const code = result.success ? result.data.error.code : "internal_error";
    if (response.status === 401)
      window.location.assign(path.startsWith("/api/kitchen/") ? "/kitchen-pair" : "/login");
    throw new ClientApiError(
      response.status,
      code,
      isErrorCode(code) ? ERROR_MESSAGES[code] : "İşlem tamamlanamadı.",
      result.success ? result.data.error.details : undefined,
    );
  }
  return schema.parse(value);
}
export const errorMessage = (error: unknown): string =>
  error instanceof z.ZodError
    ? "Bilgilerini kontrol et. Tutar ve seçimler izin verilen aralıkta olmalı."
    : error instanceof Error
      ? error.message
      : "İşlem tamamlanamadı.";
