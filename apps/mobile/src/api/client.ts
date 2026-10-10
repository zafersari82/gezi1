import {
  apiErrorBodySchema,
  ERROR_MESSAGES,
  type ErrorCode,
  isErrorCode,
  type Media,
  MEDIA_UPLOAD_FIELD,
} from "@vado/contracts";
import { Platform } from "react-native";

import { API_URL } from "./config";

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
type Query = Record<string, string | number | undefined>;

const NETWORK_ERROR_MESSAGE = "Sunucuya ulaşılamıyor. İnternet bağlantını kontrol et.";

/** API'nin döndürdüğü veya ağ katmanında oluşan hata. `message` kullanıcıya gösterilebilir. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | "network_error",
    readonly status: number,
    message: string,
    /** Bazı hataların taşıdığı ek bilgi (ör. kalan bekleme süresi); biçimi hata koduna bağlıdır. */
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Herhangi bir hatadan kullanıcıya gösterilecek iletiyi çıkarır. */
export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : ERROR_MESSAGES.internal_error;
}

/** Cihazdan seçilen ve yüklenecek görsel. Web'de `file`, telefonda `uri` kullanılır. */
export interface LocalImage {
  uri: string;
  mimeType?: string | undefined;
  file?: File | undefined;
}

let authToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

/** Oturum katmanı, belirteci ve oturumun düştüğü anda yapılacak işi buradan bildirir. */
export const apiSession = {
  setToken: (token: string | null): void => {
    authToken = token;
  },
  getToken: (): string | null => authToken,
  onUnauthorized: (handler: (() => void) | null): void => {
    unauthorizedHandler = handler;
  },
  /** Oturumun sunucuda kapatıldığı öğrenildiğinde çağrılır; cihazdaki oturum da kapanır. */
  expire: (): void => {
    unauthorizedHandler?.();
  },
};

function buildUrl(path: string, query?: Query): string {
  const params = Object.entries(query ?? {})
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return `${API_URL}${path}${params.length > 0 ? `?${params.join("&")}` : ""}`;
}

async function toError(response: Response): Promise<ApiError> {
  const body = apiErrorBodySchema.safeParse(await response.json().catch(() => null));
  const error = body.success ? body.data.error : null;
  // Uygulamanın tanımadığı kodlar (ör. daha yeni bir sunucu sürümü) genel hata olarak gösterilir.
  const code = isErrorCode(error?.code) ? error.code : "internal_error";
  return new ApiError(code, response.status, ERROR_MESSAGES[code], error?.details);
}

async function send<T>(method: Method, url: string, init: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      method,
      headers: {
        ...(init.headers as Record<string, string> | undefined),
        ...(authToken === null ? {} : { authorization: `Bearer ${authToken}` }),
      },
    });
  } catch {
    throw new ApiError("network_error", 0, NETWORK_ERROR_MESSAGE);
  }

  if (response.ok) {
    return (response.status === 204 ? undefined : await response.json()) as T;
  }
  const error = await toError(response);
  // Oturum sunucuda geçersizleştiyse (süre dolumu, başka cihazdan kapatma, askıya alma) çıkış yapılır.
  if (authToken !== null && (error.code === "unauthorized" || error.code === "account_suspended")) {
    apiSession.expire();
  }
  throw error;
}

function request<T>(method: Method, path: string, body?: unknown, query?: Query): Promise<T> {
  return send<T>(
    method,
    buildUrl(path, query),
    body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  );
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, undefined, query),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body),
  postIdempotent: <T>(path: string, key: string, body: unknown) =>
    send<T>("POST", buildUrl(path), {
      headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify(body),
    }),
  putIdempotent: <T>(path: string, key: string, body: unknown) =>
    send<T>("PUT", buildUrl(path), {
      headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify(body),
    }),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body),
  delete: <T>(path: string) => request<T>("DELETE", path),
};

/** Görseli yükler ve mesaj, paylaşım veya profil fotoğrafında kullanılacak medya kaydını döndürür. */
export function uploadImage(image: LocalImage): Promise<Media> {
  const form = new FormData();
  if (Platform.OS === "web" && image.file !== undefined) {
    form.append(MEDIA_UPLOAD_FIELD, image.file);
  } else {
    // React Native, dosyayı adresinden okuyup gövdeye ekler; bu biçim web FormData tipinde yoktur.
    const file = { uri: image.uri, name: "gorsel", type: image.mimeType ?? "image/jpeg" };
    form.append(MEDIA_UPLOAD_FIELD, file as unknown as Blob);
  }
  return send<Media>("POST", buildUrl("/v1/media"), { body: form });
}
