import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Locale } from "../shared/account";
import { api, errorText, useAccount } from "./account";

type GoogleIdentity = {
  initialize: (options: {
    client_id: string;
    nonce: string;
    auto_select: boolean;
    callback: (response: { credential: string }) => void;
  }) => void;
  renderButton: (
    element: HTMLElement,
    options: {
      theme: string;
      size: string;
      text: string;
      width: number;
      locale: string;
    },
  ) => void;
  cancel: () => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdentity } };
  }
}
let loading: Promise<void> | undefined;
function loadGoogle() {
  if (window.google?.accounts.id) return Promise.resolve();
  if (!loading)
    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      const timeout = setTimeout(() => {
        script.remove();
        loading = undefined;
        reject(new Error("Google unavailable"));
      }, 10_000);
      script.onload = () => {
        clearTimeout(timeout);
        resolve();
      };
      script.onerror = () => {
        clearTimeout(timeout);
        script.remove();
        loading = undefined;
        reject(new Error("Google unavailable"));
      };
      document.head.appendChild(script);
    });
  return loading;
}

export function GoogleSignIn({
  clientId,
  locale,
  returnTo,
}: {
  clientId: string;
  locale: Locale;
  returnTo: string;
}) {
  const target = useRef<HTMLDivElement>(null),
    submitting = useRef(false);
  const { account, refresh } = useAccount(),
    navigate = useNavigate();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0),
    [ready, setReady] = useState(false);
  const linking = !!account,
    en = locale === "en";
  useEffect(() => {
    let active = true;
    setReady(false);
    setError("");
    void (async () => {
      try {
        await loadGoogle();
        if (!active) return;
        const { nonce } = await api<{ nonce: string }>(
          "/auth/google/start",
          "POST",
          { locale, returnTo, link: linking },
        );
        if (!active || !target.current) return;
        window.google!.accounts.id.initialize({
          client_id: clientId,
          nonce,
          auto_select: false,
          callback: ({ credential }) => {
            if (!active || submitting.current) return;
            submitting.current = true;
            setBusy(true);
            setError("");
            void api<{ returnTo: string }>("/auth/google/verify", "POST", {
              credential,
            })
              .then(async (result) => {
                await refresh();
                navigate(result.returnTo, { replace: true });
              })
              .catch((e) => {
                if (active) {
                  setError(errorText(e, locale));
                  setReady(false);
                }
              })
              .finally(() => {
                submitting.current = false;
                if (active) setBusy(false);
              });
          },
        });
        window.google!.accounts.id.renderButton(target.current, {
          theme: "outline",
          size: "large",
          text: linking ? "continue_with" : "signin_with",
          width: Math.max(
            200,
            Math.min(260, Math.floor(target.current.clientWidth)),
          ),
          locale: en ? "en" : "zh_TW",
        });
        setReady(true);
      } catch (e) {
        if (active) setError(errorText(e, locale));
      }
    })();
    return () => {
      active = false;
      window.google?.accounts.id.cancel();
      target.current?.replaceChildren();
    };
  }, [clientId, locale, returnTo, linking, attempt]);
  return (
    <div className="google-sign-in">
      {linking && (
        <p>
          {en
            ? `Link Google to your current account (${account.user.email}). Choose the same email address.`
            : `將 Google 連結到目前帳號（${account.user.email}），請選擇相同 Email 的 Google 帳號。`}
        </p>
      )}
      <div
        ref={target}
        aria-label={en ? "Google sign-in" : "Google 登入"}
        style={{ pointerEvents: busy ? "none" : undefined }}
      />
      {(!ready || busy) && !error && (
        <p role="status">
          {busy
            ? en
              ? "Verifying Google sign-in…"
              : "正在驗證 Google 登入…"
            : en
              ? "Loading Google sign-in…"
              : "正在載入 Google 登入…"}
        </p>
      )}
      {error && (
        <>
          <p className="form-error" role="alert">
            {error}
          </p>
          <button
            className="inline-button"
            disabled={busy}
            onClick={() => setAttempt((v) => v + 1)}
          >
            {en ? "Reload Google sign-in" : "重新載入 Google 登入"}
          </button>
        </>
      )}
    </div>
  );
}
