import { BusinessApiError } from "./api";

export function routeError(error: unknown): Response {
  const status = error instanceof BusinessApiError ? error.status : 400;
  return Response.json(
    {
      error: {
        code: error instanceof BusinessApiError ? error.code : "validation_failed",
        message:
          error instanceof BusinessApiError
            ? error.message
            : "İstek geçersiz. Bilgilerini kontrol et.",
        ...(error instanceof BusinessApiError && error.details !== undefined
          ? { details: error.details }
          : {}),
      },
    },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
