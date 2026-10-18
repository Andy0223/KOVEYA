import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import type { Account, Locale } from "../shared/account";
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
  const response = await fetch(`/api/v1${path}`, {
    method,
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
}

const messages: Record<string, [string, string]> = {
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
    "寄信服務尚未設定，請稍後再試。",
    "Email delivery is not configured yet. Please try again later.",
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

type AccountContextValue = {
  account: Account | null;
  state: "loading" | "ready" | "failed";
  refresh: () => Promise<void>;
};
const AccountContext = createContext<AccountContextValue>(null!);
export function AccountProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [state, setState] = useState<AccountContextValue["state"]>("loading");
  const refresh = async () => {
    try {
      setAccount(await api<Account>("/me"));
      setState("ready");
    } catch (error) {
      setAccount(null);
      setState(
        error instanceof ClientError && error.code === "AUTH_REQUIRED"
          ? "ready"
          : "failed",
      );
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <AccountContext.Provider value={{ account, state, refresh }}>
      {children}
    </AccountContext.Provider>
  );
}
export const useAccount = () => useContext(AccountContext);

export function AccountGate({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const { account, state, refresh } = useAccount();
  const location = useLocation();
  const en = locale === "en";
  if (state === "loading")
    return (
      <section className="workspace page-width">
        <p role="status">
          {en ? "Loading your workspace…" : "正在載入你的工作台…"}
        </p>
      </section>
    );
  if (state === "failed")
    return (
      <section className="workspace page-width">
        <p role="alert">
          {en ? "Your account could not be loaded." : "無法載入帳號。"}
        </p>
        <button className="button primary" onClick={() => void refresh()}>
          {en ? "Try again" : "重試"}
        </button>
      </section>
    );
  if (!account)
    return (
      <section className="workspace page-width">
        <p className="eyebrow">YOUR KOVEYA</p>
        <h1>
          {en ? "Your next chapter starts here." : "從這裡，開始你的下一步。"}
        </h1>
        <p className="intro">
          {en
            ? "Sign in once to manage your personal services and your business."
            : "登入同一個帳號，管理你的服務安排與自己的事業。"}
        </p>
        <Link
          className="button primary"
          to={`/sign-in?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
        >
          {en ? "Sign in with email" : "使用 Email 登入"}
        </Link>
      </section>
    );
  return <>{children}</>;
}
