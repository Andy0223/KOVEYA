import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import type { Account, Locale } from "../shared/account";

import { api, ClientError } from "./api";
export { api, ClientError, errorText } from "./api";

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
          {en ? "Sign in" : "登入帳號"}
        </Link>
      </section>
    );
  return <>{children}</>;
}
