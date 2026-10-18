import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import type {
  ApiResponse,
  PublicProvider,
  PublicOffering,
} from "../shared/catalog";
import "./styles.css";
import {
  AccountGate,
  AccountProvider,
  api,
  errorText,
  useAccount,
} from "./account";
import { AccountSettings, SignInPage, VerifyPage } from "./identity-pages";
import {
  BusinessHome,
  BusinessProfilePage,
  DemandHome,
  ServiceEditor,
} from "./business-pages";

import {
  AvailabilityPage,
  BookingPage,
  BookingList,
  BookingDetailPage,
} from "./booking-pages";

type Locale = "zh-TW" | "en";
const copy = {
  "zh-TW": {
    individuals: "個人服務",
    business: "KOVEYA Business",
    preview: "開發預覽",
    eyebrow: "為每一份專業，連結更多可能",
    hero: "你的專業。\n從這裡，開始連結。",
    intro: "一個連結服務與人的地方。從第一個預約，到每一次值得信賴的服務關係。",
    primary: "看看服務頁面",
    secondary: "認識 KOVEYA Business",
    note: "目前支援服務頁、排班、直接預約、取消與改期提案。",
    cardTitle: "把時間，留給你熱愛的事。",
    cardNote: "提供服務 → 分享連結 → 建立關係",
    categories: ["運動與健康", "教育與學習", "創作與專業"],
    forYou: "為你，也為你的事業",
    twoWays: "同一個帳號，兩種可能。",
    demandTitle: "讓每一次安排，都更輕鬆。",
    demandText: "在同一個地方，管理你的預約、常用服務者與下一次服務。",
    supplyTitle: "讓每一份專業，都有自己的空間。",
    supplyText:
      "建立服務頁、分享你的連結，讓既有客戶更容易預約。Your clients. Your business.",
    explore: "認識需求方體驗",
    learn: "認識供給方體驗",
    journey: "從第一次預約，到長期關係",
    steps: ["建立自己的服務頁", "分享到既有社群", "讓客戶自行安排"],
    footer: "Where People & Services Connect.",
    notFound: "找不到這個頁面",
    back: "回到首頁",
    providerLabel: "供給方公開頁",
    services: "服務項目",
    timezone: "服務時區",
    details: "查看服務內容",
    hide: "收起內容",
    policy: "取消政策",
    demo: "此為虛構示範供給方，僅供產品開發測試。",
    bookingSoon: "預約功能建置中，尚未開放選時段或提交預約。",
    minutes: "分鐘",
    loading: "正在載入服務頁…",
    failed: "無法載入服務頁，請稍後重試。",
    retry: "重新載入",
    missing: "服務頁不存在或尚未公開。",
    free: "免費",
    quote: "待報價",
    instant: "直接預約",
    request: "申請預約",
    workspaceDemand: "我的服務，安排在一起。",
    workspaceSupply: "把你的專業，帶到更多人身邊。",
    workspaceDemandText:
      "未來將在這裡查看預約、處理取消與改期，以及找到曾經使用的服務者。",
    workspaceSupplyText:
      "從一個服務、一個分享連結開始，逐步管理預約、客戶與日常營運。",
    workspaceNote:
      "工作台目前為體驗介紹。Email 驗證、帳號與私人資料功能將在下一階段接上。",
    supplySteps: ["建立品牌", "設定服務與可用時間", "分享預約連結"],
    demandSteps: ["查看公開服務", "選擇時間與驗證身分", "管理服務安排"],
  },
  en: {
    individuals: "For individuals",
    business: "KOVEYA Business",
    preview: "Development preview",
    eyebrow: "A little more connected. A lot more possible.",
    hero: "Your expertise.\nA world of connection.",
    intro:
      "A place for people and services to connect. From your first booking to relationships that last.",
    primary: "Explore a service page",
    secondary: "Meet KOVEYA Business",
    note: "Create service pages, set your hours, and manage instant bookings, cancellations and reschedule proposals.",
    cardTitle: "More time for what you love.",
    cardNote: "Offer a service → Share your link → Build a relationship",
    categories: [
      "Movement & wellbeing",
      "Education & learning",
      "Creative & professional",
    ],
    forYou: "For you, and your business",
    twoWays: "One account. Both sides of life.",
    demandTitle: "Make room for your next experience.",
    demandText:
      "Your bookings, trusted providers, and next service. Together in one place.",
    supplyTitle: "Give your expertise a place to grow.",
    supplyText:
      "Create your service page and share a link with the people who already trust you. Your clients. Your business.",
    explore: "Meet your personal workspace",
    learn: "Meet your business workspace",
    journey: "From first booking to lasting relationships",
    steps: [
      "Create your service page",
      "Share with your community",
      "Let clients find their time",
    ],
    footer: "Where People & Services Connect.",
    notFound: "This page could not be found",
    back: "Back to home",
    providerLabel: "Provider page",
    services: "Services",
    timezone: "Service timezone",
    details: "View service details",
    hide: "Hide details",
    policy: "Cancellation policy",
    demo: "This fictional provider is for product development and testing only.",
    bookingSoon:
      "Booking is being built. Time selection and booking submissions are not available yet.",
    minutes: "min",
    loading: "Loading service page…",
    failed: "We could not load this service page. Please try again.",
    retry: "Try again",
    missing: "This service page does not exist or is not published.",
    free: "Free",
    quote: "Price on request",
    instant: "Instant booking",
    request: "Request to book",
    workspaceDemand: "Your services. A little more together.",
    workspaceSupply: "Give your expertise a place to grow.",
    workspaceDemandText:
      "This will be your place to see bookings, manage changes, and return to the providers you trust.",
    workspaceSupplyText:
      "Start with one service and one shareable link. Build toward simpler bookings, client relationships, and daily operations.",
    workspaceNote:
      "This is an introduction to the workspace. Email verification, accounts, and private data will follow in the next phase.",
    supplySteps: [
      "Create your profile",
      "Set services and availability",
      "Share your booking link",
    ],
    demandSteps: [
      "Explore a service",
      "Choose a time and verify your identity",
      "Manage your bookings",
    ],
  },
};

function formatPrice(o: PublicOffering, locale: Locale) {
  const t = copy[locale];
  if (o.pricingType === "QUOTE" || o.priceMinor === null) return t.quote;
  if (o.pricingType === "FREE") return t.free;
  const formatter = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: o.currency,
    currencyDisplay: "code",
  });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 0;
  return formatter.format(o.priceMinor / 10 ** digits);
}

function App() {
  const [locale, setLocale] = useState<Locale>(() => {
    try {
      return localStorage.getItem("koveya.locale") === "en" ? "en" : "zh-TW";
    } catch {
      return "zh-TW";
    }
  });
  const t = copy[locale];
  const { account, refresh } = useAccount();
  const [accountError, setAccountError] = useState("");
  const { pathname } = useLocation();
  useEffect(() => {
    if (account?.user.locale) setLocale(account.user.locale);
  }, [account?.user.id, account?.user.locale]);
  useEffect(() => {
    document.documentElement.lang = locale === "zh-TW" ? "zh-Hant" : "en";
    try {
      localStorage.setItem("koveya.locale", locale);
    } catch {
      /* Storage can be unavailable in private browsers. */
    }
  }, [locale]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <a className="skip-link" href="#main">
        {locale === "en" ? "Skip to content" : "跳至主要內容"}
      </a>
      <header className="site-header">
        <Link className="wordmark" to="/" aria-label="KOVEYA home">
          KOVEYA<span>↗</span>
        </Link>
        <nav aria-label={locale === "en" ? "Main navigation" : "主要導覽"}>
          <Link className={pathname === "/app" ? "active" : ""} to="/app">
            {t.individuals}
          </Link>
          <Link
            className={pathname === "/business" ? "active" : ""}
            to="/business"
          >
            {t.business}
          </Link>
          <Link
            className="account-link"
            to={account ? "/app/profile" : "/sign-in"}
          >
            {account
              ? locale === "en"
                ? "Account"
                : "帳號"
              : locale === "en"
                ? "Sign in"
                : "登入"}
          </Link>
          {account && (
            <button
              className="header-logout"
              onClick={async () => {
                try {
                  await api("/auth/logout", "POST");
                  await refresh();
                  setAccountError("");
                } catch (error) {
                  setAccountError(errorText(error, locale));
                }
              }}
            >
              {locale === "en" ? "Sign out" : "登出"}
            </button>
          )}
          <button
            className="locale-button"
            onClick={() => setLocale(locale === "en" ? "zh-TW" : "en")}
            aria-label={locale === "en" ? "切換繁體中文" : "Switch to English"}
          >
            {locale === "en" ? "繁中" : "EN"} <span aria-hidden>◎</span>
          </button>
        </nav>
      </header>
      {accountError && (
        <p className="form-error page-width" role="alert">
          {accountError}
        </p>
      )}
      <main id="main">
        <Routes>
          <Route
            path="/"
            element={
              <>
                <section className="hero page-width">
                  <div className="hero-copy">
                    <p className="eyebrow">
                      <span className="dot" />
                      {t.eyebrow}
                    </p>
                    <h1>{t.hero}</h1>
                    <p className="intro">{t.intro}</p>
                    <div className="hero-actions">
                      <Link className="button primary" to="/p/demo-coach">
                        {t.primary}
                        <span aria-hidden>↗</span>
                      </Link>
                      <Link className="text-link" to="/business">
                        {t.secondary}
                        <span aria-hidden>→</span>
                      </Link>
                    </div>
                    <p className="dev-note">{t.note}</p>
                  </div>
                  <div className="connection-art" aria-label={t.cardTitle}>
                    <div className="art-grid" />
                    <span className="orbit orbit-one" />
                    <span className="orbit orbit-two" />
                    <div className="art-label">
                      PEOPLE <span>↔</span> POSSIBILITIES
                    </div>
                    <div className="art-word">
                      connect<span>.</span>
                    </div>
                    <div className="connection-node node-one">↗</div>
                    <div className="connection-node node-two">✳</div>
                    <div className="art-caption">
                      <h2>{t.cardTitle}</h2>
                      <p>{t.cardNote}</p>
                    </div>
                  </div>
                </section>
                <div className="category-strip page-width">
                  {t.categories.map((category, i) => (
                    <span key={category}>
                      <span aria-hidden>{["↗", "✳", "◈"][i]}</span>
                      {category}
                    </span>
                  ))}
                </div>
                <section className="people-section page-width">
                  <p className="eyebrow">{t.forYou}</p>
                  <h2>{t.twoWays}</h2>
                  <div className="audience-grid">
                    <article className="audience-card demand">
                      <span className="card-number">01 / FOR YOU</span>
                      <h3>{t.demandTitle}</h3>
                      <p>{t.demandText}</p>
                      <Link className="text-link" to="/app">
                        {t.explore} <span aria-hidden>→</span>
                      </Link>
                    </article>
                    <article className="audience-card supply">
                      <span className="card-number">
                        02 / FOR YOUR BUSINESS
                      </span>
                      <h3>{t.supplyTitle}</h3>
                      <p>{t.supplyText}</p>
                      <Link className="text-link" to="/business">
                        {t.learn} <span aria-hidden>→</span>
                      </Link>
                    </article>
                  </div>
                </section>
                <section className="journey page-width">
                  <h2>{t.journey}</h2>
                  <ol>
                    {t.steps.map((step, i) => (
                      <li key={step}>
                        <span>0{i + 1}</span>
                        {step}
                      </li>
                    ))}
                  </ol>
                </section>
              </>
            }
          />
          <Route path="/p/:slug" element={<ProviderPage locale={locale} />} />
          <Route
            path="/p/:slug/book/:id"
            element={<BookingPage locale={locale} />}
          />
          <Route
            path="/app/bookings"
            element={
              <AccountGate locale={locale}>
                <BookingList locale={locale} />
              </AccountGate>
            }
          />
          <Route
            path="/app/bookings/:id"
            element={
              <AccountGate locale={locale}>
                <BookingDetailPage locale={locale} />
              </AccountGate>
            }
          />
          <Route
            path="/business/bookings"
            element={
              <AccountGate locale={locale}>
                <BookingList locale={locale} business />
              </AccountGate>
            }
          />
          <Route
            path="/business/availability"
            element={
              <AccountGate locale={locale}>
                <AvailabilityPage locale={locale} />
              </AccountGate>
            }
          />
          <Route path="/sign-in" element={<SignInPage locale={locale} />} />
          <Route path="/auth/verify" element={<VerifyPage locale={locale} />} />
          <Route
            path="/app"
            element={
              <AccountGate locale={locale}>
                <DemandHome locale={locale} />
              </AccountGate>
            }
          />
          <Route
            path="/app/profile"
            element={
              <AccountGate locale={locale}>
                <AccountSettings locale={locale} />
              </AccountGate>
            }
          />
          <Route
            path="/business"
            element={
              <AccountGate locale={locale}>
                <BusinessHome locale={locale} />
              </AccountGate>
            }
          />
          <Route
            path="/business/profile"
            element={
              <AccountGate locale={locale}>
                <BusinessProfilePage locale={locale} />
              </AccountGate>
            }
          />
          <Route
            path="/business/services/new"
            element={
              <AccountGate locale={locale}>
                <ServiceEditor locale={locale} />
              </AccountGate>
            }
          />
          <Route
            path="/business/services/:id"
            element={
              <AccountGate locale={locale}>
                <ServiceEditor locale={locale} />
              </AccountGate>
            }
          />
          <Route
            path="*"
            element={
              <section className="workspace page-width">
                <h1>{t.notFound}</h1>
                <Link to="/">{t.back}</Link>
              </section>
            }
          />
        </Routes>
      </main>
      <footer className="site-footer page-width">
        <Link className="wordmark" to="/">
          KOVEYA<span>↗</span>
        </Link>
        <p>{t.footer}</p>
        <span className="preview-tag">{t.preview} · v0.3</span>
      </footer>
    </>
  );
}

function ProviderPage({ locale }: { locale: Locale }) {
  const { pathname } = useLocation();
  const slug = pathname.split("/")[2] ?? "";
  const [provider, setProvider] = useState<PublicProvider | null>(null);
  const [state, setState] = useState<
    "loading" | "ready" | "failed" | "missing"
  >("loading");
  const [attempt, setAttempt] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const t = copy[locale];

  useEffect(() => {
    const controller = new AbortController();
    setState("loading");
    setProvider(null);
    setExpanded(null);
    void (async () => {
      try {
        const response = await fetch(
          `/api/v1/providers/${encodeURIComponent(slug)}`,
          { signal: controller.signal },
        );
        if (response.status === 404) {
          setState("missing");
          return;
        }
        if (!response.ok) throw new Error("Request failed");
        const body = (await response.json()) as ApiResponse<PublicProvider>;
        if (!("data" in body)) throw new Error("Invalid response");
        setProvider(body.data);
        setState("ready");
      } catch {
        if (!controller.signal.aborted) setState("failed");
      }
    })();
    return () => controller.abort();
  }, [slug, attempt]);

  if (state !== "ready" || !provider)
    return (
      <section className="workspace page-width">
        <p role={state === "failed" ? "alert" : "status"}>
          {state === "failed"
            ? t.failed
            : state === "missing"
              ? t.missing
              : t.loading}
        </p>
        {state === "failed" && (
          <button
            className="button primary"
            onClick={() => setAttempt((a) => a + 1)}
          >
            {t.retry}
          </button>
        )}
        <Link className="text-link" to="/">
          {t.back}
        </Link>
      </section>
    );

  return (
    <section className="provider-page page-width">
      <p className="eyebrow">{t.providerLabel}</p>
      {slug === "demo-coach" && <p className="notice">{t.demo}</p>}
      <div className="provider-layout">
        <aside>
          <div className="provider-avatar" aria-hidden>
            {provider.publicName.trim().split(/\s+/).length > 1
              ? provider.publicName
                  .trim()
                  .split(/\s+/)
                  .map((word) => word[0])
                  .slice(0, 2)
                  .join("")
                  .toUpperCase()
              : [...provider.publicName].slice(0, 2).join("").toUpperCase()}
            <span>↗</span>
          </div>
          <h1>{provider.publicName}</h1>
          <p className="location">◎ {provider.locationLabel}</p>
          <p>{provider.bio}</p>
          <p className="timezone">
            {t.timezone}
            <br />
            <strong>{provider.timezone}</strong>
          </p>
        </aside>
        <div>
          <h2>
            {t.services}
            <span className="service-count">
              {provider.services.length.toString().padStart(2, "0")}
            </span>
          </h2>
          {provider.services.length === 0 && (
            <p className="notice">
              {locale === "en"
                ? "This provider has not published any services yet."
                : "這位供給方尚未發布服務。"}
            </p>
          )}
          {provider.services.map((service) => (
            <article className="service-card" key={service.id}>
              <div className="service-topline">
                <span className="service-mode">
                  {service.mode === "INSTANT" ? t.instant : t.request}
                </span>
                <span>{service.timezone}</span>
              </div>
              <h3>{service.name}</h3>
              <p>{service.description}</p>
              {service.offerings.map((o) => (
                <div className="offering" key={o.id}>
                  <span>
                    {o.durationMinutes} {t.minutes}
                  </span>
                  <strong>{formatPrice(o, locale)}</strong>
                </div>
              ))}
              <button
                className="service-toggle"
                aria-expanded={expanded === service.id}
                aria-controls={`details-${service.id}`}
                onClick={() =>
                  setExpanded(expanded === service.id ? null : service.id)
                }
              >
                {expanded === service.id ? t.hide : t.details}
                <span aria-hidden>{expanded === service.id ? "−" : "+"}</span>
              </button>
              {expanded === service.id && (
                <div className="service-details" id={`details-${service.id}`}>
                  <p>◎ {service.locationLabel}</p>
                  <h4>{t.policy}</h4>
                  <p>{service.cancellationPolicy}</p>
                  {service.mode === "INSTANT" && (
                    <Link
                      className="button primary"
                      to={`/p/${slug}/book/${service.id}`}
                    >
                      {locale === "en" ? "Choose a time" : "選擇預約時間"} →
                    </Link>
                  )}
                  <p className="notice">
                    {service.mode === "INSTANT"
                      ? locale === "en"
                        ? "Choose a time, then sign in to confirm."
                        : "先選擇時間，再登入確認預約。"
                      : locale === "en"
                        ? "Request-to-book is coming next."
                        : "申請式預約正在接續開發。"}
                  </p>
                </div>
              )}
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AccountProvider>
        <App />
      </AccountProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
