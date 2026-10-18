import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Locale } from "../shared/account";
import { api, errorText, useAccount } from "./account";

export function SignInPage({ locale }: { locale: Locale }) {
  const en = locale === "en",
    navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [delivery, setDelivery] = useState("loading");
  const [sent, setSent] = useState<{ localPreviewUrl?: string } | null>(null);
  const { account } = useAccount();
  useEffect(() => {
    api<{ delivery: string }>("/auth/config")
      .then((value) => setDelivery(value.delivery))
      .catch(() => setDelivery("unavailable"));
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setSent(
        await api("/auth/email/start", "POST", {
          email: email.trim(),
          returnTo: params.get("returnTo") ?? "/app",
          locale,
        }),
      );
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-page page-width">
      <div className="auth-card">
        <p className="eyebrow">WELCOME TO KOVEYA</p>
        <h1>{en ? "A link. And you’re in." : "一封信，開始連結。"}</h1>
        <p>
          {en
            ? "No password to remember. We’ll send a one-time link that expires in 10 minutes."
            : "不必記住密碼。我們會寄送一個有效 10 分鐘、僅能使用一次的驗證連結。"}
        </p>
        {account && (
          <p className="notice">
            {en ? "You are already signed in." : "你目前已登入。"}{" "}
            <button className="inline-button" onClick={() => navigate("/app")}>
              {en ? "Go to workspace" : "前往工作台"}
            </button>
          </p>
        )}
        {!sent ? (
          <form onSubmit={submit} className="stack-form">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {delivery === "unavailable" && (
              <p className="notice">
                {en
                  ? "Email delivery has not been configured for this environment."
                  : "這個環境的寄信服務尚未設定。"}
              </p>
            )}
            <button
              className="button primary"
              disabled={busy || ["loading", "unavailable"].includes(delivery)}
            >
              {busy
                ? en
                  ? "Sending…"
                  : "傳送中…"
                : en
                  ? "Send sign-in link"
                  : "寄送登入連結"}
            </button>
          </form>
        ) : (
          <div className="sent-state" role="status">
            <h2>{en ? "Check your inbox." : "請查看你的信箱。"}</h2>
            <p>
              {en
                ? "Open the link in the same browser where you requested it."
                : "請在發送連結的同一瀏覽器中開啟驗證連結。"}
            </p>
            {sent.localPreviewUrl && (
              <div className="notice">
                <p>
                  {en
                    ? "Local test mode: no email was sent."
                    : "本機測試模式：不會寄出真實 Email。"}
                </p>
                <a className="text-link" href={sent.localPreviewUrl}>
                  {en ? "Open local verification link" : "開啟本機驗證連結"} →
                </a>
              </div>
            )}
            <button
              className="inline-button"
              onClick={() => {
                setSent(null);
                setError("");
              }}
            >
              {en ? "Use another email or resend" : "更換 Email 或重新寄送"}
            </button>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Link className="text-link" to="/">
          {en ? "Back to home" : "回到首頁"} →
        </Link>
      </div>
    </section>
  );
}

export function VerifyPage({ locale }: { locale: Locale }) {
  const en = locale === "en",
    navigate = useNavigate(),
    { refresh } = useAccount();
  const [token] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  async function verify() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ returnTo: string }>(
        "/auth/email/verify",
        "POST",
        { token },
      );
      await refresh();
      navigate(result.returnTo, { replace: true });
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-page page-width">
      <div className="auth-card">
        <p className="eyebrow">ONE MORE STEP</p>
        <h1>{en ? "Ready to connect?" : "準備好開始了嗎？"}</h1>
        <p>
          {en
            ? "Confirm to sign in to the account associated with this email link."
            : "確認後，即可登入這封驗證信所屬的帳號。"}
        </p>
        {token ? (
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void verify()}
          >
            {busy
              ? en
                ? "Verifying…"
                : "驗證中…"
              : en
                ? "Confirm sign-in"
                : "確認登入"}
          </button>
        ) : (
          <p className="form-error" role="alert">
            {en
              ? "This link is invalid. Please request a new one."
              : "此連結無效，請重新申請登入。"}
          </p>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <Link className="text-link" to="/sign-in">
          {en ? "Request a new link" : "重新申請連結"} →
        </Link>
      </div>
    </section>
  );
}

export function AccountSettings({ locale }: { locale: Locale }) {
  const { account, refresh } = useAccount(),
    en = locale === "en";
  const [name, setName] = useState(account?.user.name ?? ""),
    [zone, setZone] = useState(account?.user.timezone ?? "Asia/Taipei");
  const [language, setLanguage] = useState<Locale>(
    account?.user.locale ?? locale,
  );
  const [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [requests, setRequests] = useState<
    { id: string; type: string; status: string }[]
  >([]);
  useEffect(() => {
    void api<typeof requests>("/privacy-requests")
      .then(setRequests)
      .catch((e) => setError(errorText(e, locale)));
  }, [locale]);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api("/me", "PATCH", { name, timezone: zone, locale: language });
      await refresh();
      setNotice(en ? "Profile saved." : "個人資料已儲存。");
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setBusy(false);
    }
  }
  async function privacy(type: "EXPORT" | "DELETE") {
    setBusy(true);
    setError("");
    try {
      await api("/privacy-requests", "POST", { type });
      setRequests(await api("/privacy-requests"));
      setNotice(
        en
          ? "Your request was recorded. This does not immediately export or delete data."
          : "已記錄申請，這項操作不會立即匯出或刪除資料。",
      );
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="workspace page-width settings-page">
      <p className="eyebrow">YOUR ACCOUNT</p>
      <h1>{en ? "Your profile & account" : "個人資料與帳號"}</h1>
      <p className="account-email">{account?.user.email}</p>
      <form className="stack-form panel" onSubmit={save}>
        <h2>{en ? "Profile" : "個人資料"}</h2>
        <label htmlFor="name">{en ? "Name" : "姓名"}</label>
        <input
          id="name"
          value={name}
          required
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
        />
        <label htmlFor="timezone">{en ? "Timezone" : "時區"}</label>
        <input
          id="timezone"
          value={zone}
          required
          onChange={(e) => setZone(e.target.value)}
          placeholder="Asia/Taipei"
        />
        <label htmlFor="language">
          {en ? "Preferred language" : "偏好語言"}
        </label>
        <select
          id="language"
          value={language}
          onChange={(e) => setLanguage(e.target.value as Locale)}
        >
          <option value="zh-TW">繁體中文</option>
          <option value="en">English</option>
        </select>
        <button className="button primary" disabled={busy}>
          {en ? "Save profile" : "儲存個人資料"}
        </button>
      </form>
      <section className="panel">
        <h2>{en ? "Privacy requests" : "資料管理申請"}</h2>
        <p>
          {en
            ? "Submit a request for manual review. No data is immediately removed."
            : "可提交資料匯出或帳號刪除申請；需要人工審核，不會立即刪除資料。"}
        </p>
        <div className="button-row">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void privacy("EXPORT")}
          >
            {en ? "Request data export" : "申請資料匯出"}
          </button>
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => void privacy("DELETE")}
          >
            {en ? "Request account deletion" : "申請帳號刪除"}
          </button>
        </div>
        {requests.length > 0 && (
          <ul className="request-list">
            {requests.map((r) => (
              <li key={r.id}>
                {r.type === "EXPORT"
                  ? en
                    ? "Data export"
                    : "資料匯出"
                  : en
                    ? "Account deletion"
                    : "帳號刪除"}{" "}
                ·{" "}
                {r.status === "SUBMITTED"
                  ? en
                    ? "Submitted"
                    : "已提交"
                  : r.status}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel">
        <h2>{en ? "Active sessions" : "登入工作階段"}</h2>
        <p>
          {en
            ? "Sign out on every browser, including this one."
            : "撤銷所有瀏覽器的登入狀態，包含目前使用的瀏覽器。"}
        </p>
        <button
          className="button secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await api("/auth/sessions/revoke-all", "POST");
              await refresh();
            } catch (e) {
              setError(errorText(e, locale));
            } finally {
              setBusy(false);
            }
          }}
        >
          {en ? "Sign out everywhere" : "登出所有裝置"}
        </button>
      </section>
      {notice && (
        <p className="form-success" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
