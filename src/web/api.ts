import type { Locale } from "../shared/account";
import type { ApiResponse } from "../shared/catalog";

export class ClientError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  value?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`/api/v1${path}`, {
      method,
      signal: controller.signal,
      credentials: "same-origin",
      ...(method !== "GET"
        ? {
            headers: {
              "Content-Type": "application/json",
              ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
            },
            body: JSON.stringify(value ?? {}),
          }
        : {}),
    });
    const result = (await response.json()) as ApiResponse<T>;
    if (!response.ok || !("data" in result))
      throw new ClientError(
        "error" in result ? result.error.code : "INTERNAL_ERROR",
      );
    return result.data;
  } catch (error) {
    if (controller.signal.aborted) throw new ClientError("REQUEST_TIMEOUT");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

const messages: Record<string, [string, string]> = {
  GOOGLE_LOGIN_INVALID: [
    "Google 驗證已失效或無法確認，請重新載入 Google 登入。",
    "Google verification failed or expired. Reload Google sign-in.",
  ],
  GOOGLE_LINK_REQUIRED: [
    "此 Email 已有 KOVEYA 帳號。請先使用 Email 登入，再到帳號設定連結 Google。",
    "This email already has a KOVEYA account. Sign in with email first, then link Google in account settings.",
  ],
  GOOGLE_ACCOUNT_CONFLICT: [
    "請選擇與目前 KOVEYA 帳號相同 Email、且未連結其他帳號的 Google 帳號。",
    "Choose Google with the same email as your current KOVEYA account, without another account link.",
  ],
  REQUEST_TIMEOUT: [
    "連線逾時，已停止等待。若剛才正在儲存或預約，操作可能已完成；請先重新整理確認結果，再重試。",
    "The connection timed out. A save or booking may still have completed; refresh to check the result before retrying.",
  ],
  SLOT_UNAVAILABLE: [
    "這個時段已被預約或不再開放，請重新查詢。",
    "This time is no longer available. Please reload times.",
  ],
  POLICY_VIOLATION: [
    "此操作不符合預約期限或服務政策。",
    "This action does not meet the service policy or notice period.",
  ],
  IDEMPOTENCY_CONFLICT: [
    "這筆操作的內容已變更，請重新載入。",
    "This operation changed. Please reload.",
  ],
  BUSINESS_REQUIRED: [
    "請先建立品牌頁。",
    "Please create a business profile first.",
  ],
  VALIDATION_ERROR: [
    "請檢查欄位、時間與價格格式。",
    "Please check the fields, time settings, and price.",
  ],
  RATE_LIMITED: [
    "操作太頻繁，請稍後再試。",
    "Too many attempts. Please try again later.",
  ],
  INVALID_LOGIN_LINK: [
    "連結已失效、已使用，或不是在發送連結的同一瀏覽器開啟。請重新申請。",
    "This link expired, was already used, or was opened in a different browser. Please request a new one.",
  ],
  AUTH_REQUIRED: ["請重新登入後再操作。", "Please sign in again to continue."],
  EMAIL_UNAVAILABLE: [
    "暫時無法寄出驗證信，請稍後再試。",
    "We could not send your sign-in email. Please try again later.",
  ],
  SERVICE_UNAVAILABLE: [
    "服務暫時無法使用，請稍後再試。",
    "The service is temporarily unavailable. Please try again later.",
  ],
  BUSINESS_CONFLICT: [
    "這個公開網址已被使用，請換一個。",
    "This public address is already taken. Please choose another.",
  ],
  BUSINESS_EXISTS: [
    "這個帳號已經有品牌，請重新載入。",
    "This account already has a business. Please reload.",
  ],
  STATE_CONFLICT: [
    "資料已在其他地方變更，請重新載入後再操作。",
    "This service changed elsewhere. Please reload before trying again.",
  ],
  PROFILE_UNPUBLISHED: [
    "請先公開品牌頁，再發布服務。",
    "Publish your business profile before publishing a service.",
  ],
  SLUG_IMMUTABLE: [
    "公開網址建立後不能直接變更。",
    "The public address cannot be changed after creation.",
  ],
  NOT_FOUND: [
    "找不到資料，或你沒有存取權限。",
    "This item could not be found or is not accessible.",
  ],
};
export function errorText(error: unknown, locale: Locale) {
  const code = error instanceof ClientError ? error.code : "";
  return (
    messages[code]?.[locale === "en" ? 1 : 0] ??
    (locale === "en"
      ? "Something went wrong. Please try again."
      : "暫時無法完成操作，請重試。")
  );
}
