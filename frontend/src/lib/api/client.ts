/**
 * Low-level HTTP client: the only place that calls fetch().
 *
 * Every failure becomes one of two error classes so the UI can react simply:
 *   - ApiError      the backend answered, but with an error (4xx/5xx)
 *   - NetworkError  the backend could not be reached at all
 */

import { API_BASE_URL } from "@/lib/config";
import type { ErrorResponse } from "@/lib/api/types";
import { getClientId } from "@/lib/clientId";

const DEFAULT_TIMEOUT_MS = 15_000;

/** The backend replied with an error status, e.g. 422 validation_error. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** No response: server down, wrong URL, CORS blocked, or timed out. */
export class NetworkError extends Error {
  constructor(
    message: string,
    readonly timedOut = false,
  ) {
    super(message);
    this.name = "NetworkError";
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Lets callers cancel a request, e.g. when a component unmounts. */
  signal?: AbortSignal;
  timeoutMs?: number;
  /**
   * Send X-Client-Id so the WebSocket events this request causes carry our
   * id. Defaults to true for everything except GET: a custom header forces a
   * CORS preflight, and plain reads (polling the chain) cause no events.
   */
  identify?: boolean;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, signal, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const identify = options.identify ?? method !== "GET";

  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        // Lets this tab recognise its own actions in the WebSocket stream.
        ...(identify ? { "X-Client-Id": getClientId() } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: combined,
      cache: "no-store",
    });
  } catch (err) {
    // A caller-initiated abort is not a connection problem: re-throw as-is.
    if (signal?.aborted) throw err;
    if (timeout.aborted) {
      throw new NetworkError(`İstek zaman aşımına uğradı: ${path} , süre ${timeoutMs / 1000} sn`, true);
    }
    throw new NetworkError(`Sunucuya şu adresten ulaşılamadı: ${API_BASE_URL}`);
  }

  // Parse the body once; some error pages may not be JSON.
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    if (isErrorResponse(payload)) {
      const { code, message, details } = payload.error;
      throw new ApiError(response.status, code, message, details);
    }
    throw new ApiError(response.status, "http_error", `HTTP ${response.status}`, payload);
  }
  return payload as T;
}

function isErrorResponse(value: unknown): value is ErrorResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as ErrorResponse).error?.message === "string"
  );
}

/**
 * The backend's error messages are English (it is a developer API). The
 * interface is Arabic, so known messages are matched by pattern and shown in
 * Arabic; anything else gets an Arabic message for its error code.
 */
const SERVER_MESSAGES: Array<[RegExp, string]> = [
  [/mining job \w+ is already running/i, "Zaten bir kazım çalışıyor."],
  [/no mining job is running/i, "Çalışan bir kazım yok."],
  [/cannot reset while|started during the reset/i, "Kazım sırasında sıfırlanamaz; önce kazımı durdurun."],
  [/already pending/i, "Bu işlem zaten bekleyen işlemlerde var."],
  [/already in the chain/i, "Bu işlem zaten zincirde var."],
  [/sender and receiver must be different/i, "Gönderen alıcıdan farklı olmalıdır."],
  [/reserved for mining rewards/i, "NETWORK adı madencilik ödülleri için ayrılmıştır."],
  [/amount must be greater than zero|amount: Input should be greater than 0/i, "Tutar sıfırdan büyük olmalıdır."],
  [/changed while it was being re-mined/i, "Blok yeniden kazılırken değişti; tekrar deneyin."],
  [/has no transaction/i, "Blokta bu numarada bir işlem yok."],
  [/is already mining/i, "Bu düğüm zaten kazıyor."],
  [/at most \d+ nodes/i, "Simülasyon en fazla 8 düğümü destekler."],
  [/at least one node/i, "Ağın en az bir düğüme ihtiyacı var."],
  [/only the genesis block exists/i, "Yalnızca genesis bloğu var; önce bir blok kazın."],
  [/exactly one group|at least two non-empty groups/i, "Her düğüm tam olarak bir grupta yer almalı ve en az iki grup olmalıdır."],
  [/another sandbox search is running/i, "Başka bir deneme araması çalışıyor; birazdan tekrar deneyin."],
  [/does not exist/i, "İstenen öğe bulunamadı."],
];

const CODE_MESSAGES: Record<string, string> = {
  validation_error: "Girilen veri geçersiz.",
  invalid_transaction: "İşlem geçersiz.",
  invalid_block: "Blok geçersiz.",
  not_found: "İstenen öğe bulunamadı.",
  conflict: "İşlem mevcut durumda gerçekleştirilemez.",
  bad_request: "İstek geçersiz.",
  internal_error: "Sunucuda dahili bir hata oluştu.",
};

/** A user-facing Arabic message for any thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof NetworkError) return err.message;
  if (err instanceof ApiError) {
    const known = SERVER_MESSAGES.find(([pattern]) => pattern.test(err.message));
    return known?.[1] ?? CODE_MESSAGES[err.code] ?? `Bir hata oluştu (HTTP ${err.status}).`;
  }
  return "Beklenmeyen bir hata oluştu.";
}
