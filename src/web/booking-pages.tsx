import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import type { Locale } from "../shared/account";
import type { PublicProvider } from "../shared/catalog";
import type {
  Availability,
  Booking,
  BookingDetail,
  Interval,
  Schedule,
} from "../shared/booking";
import { api, ClientError, errorText, useAccount } from "./account";
import { BusinessNav, BusinessProfilePage } from "./business-pages";

export function today(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
function timeLabel(time: number, tz: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "shortOffset",
  }).format(time);
}
export function when(time: number, tz: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: tz,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(time);
}
export function price(minor: number, currency: string, locale: Locale) {
  const f = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "code",
  });
  return f.format(
    minor / 10 ** (f.resolvedOptions().maximumFractionDigits ?? 0),
  );
}
export function useOperationKey() {
  const last = useRef({ value: "", key: "" });
  return (value: unknown) => {
    const text = JSON.stringify(value);
    if (last.current.value !== text)
      last.current = { value: text, key: crypto.randomUUID() };
    return last.current.key;
  };
}
export function ErrorNotice({ message }: { message: string }) {
  return message ? (
    <p className="form-error" role="alert">
      {message}
    </p>
  ) : null;
}

export function TimePicker({
  locale,
  timezone,
  date,
  onDate,
  selected,
  onSelect,
  endpoint,
  onValidityChange,
}: {
  locale: Locale;
  timezone: string;
  date: string;
  onDate: (v: string) => void;
  selected: number | null;
  onSelect: (v: number | null) => void;
  endpoint: (date: string) => string;
  onValidityChange?: (valid: boolean) => void;
}) {
  const [slots, setSlots] = useState<number[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const [loadedUrl, setLoadedUrl] = useState("");
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  const url = date ? endpoint(date) : "",
    en = locale === "en";
  useEffect(() => {
    let active = true;
    setSlots([]);
    setError("");
    setLoading(true);
    setLoadedUrl("");
    if (!url) {
      setLoading(false);
      return;
    }
    void api<Availability>(url)
      .then((result) => {
        if (active) {
          setSlots(result.slots);
          setLoadedUrl(url);
          setLoading(false);
          if (selected !== null && !result.slots.includes(selected))
            selectRef.current(null);
        }
      })
      .catch((e) => {
        if (active) {
          setError(errorText(e, locale));
          setLoading(false);
          selectRef.current(null);
        }
      });
    return () => {
      active = false;
    };
  }, [url, attempt]);
  const valid =
    !loading &&
    !error &&
    loadedUrl === url &&
    selected !== null &&
    slots.includes(selected);
  useEffect(() => {
    onValidityChange?.(valid);
  }, [valid, onValidityChange]);
  return (
    <div className="time-picker">
      <label htmlFor="booking-date">
        {en ? "Date in service timezone" : "服務當地日期"} · {timezone}
      </label>
      <input
        id="booking-date"
        type="date"
        required
        min={today(timezone)}
        value={date}
        onChange={(e) => {
          onSelect(null);
          onDate(e.target.value);
        }}
      />
      {loading ? (
        <p role="status">
          {en ? "Finding available times…" : "正在查詢可用時間…"}
        </p>
      ) : error ? (
        <>
          <ErrorNotice message={error} />
          <button
            type="button"
            className="button secondary"
            onClick={() => setAttempt((a) => a + 1)}
          >
            {en ? "Retry" : "重新查詢"}
          </button>
        </>
      ) : (
        <>
          {slots.length === 0 ? (
            <p className="notice">
              {en
                ? "No available times on this date. Choose another date; only times within the provider's schedule and advance-notice rules are shown."
                : "這一天沒有可用時段，請選擇其他日期；僅顯示符合供給方排班與提前預約規則的時間。"}
            </p>
          ) : (
            <div
              className="slot-grid"
              role="group"
              aria-label={en ? "Available times" : "可用時段"}
            >
              {slots.map((slot) => (
                <button
                  type="button"
                  key={slot}
                  className={`slot-button ${selected === slot ? "selected" : ""}`}
                  aria-pressed={selected === slot}
                  onClick={() => onSelect(slot)}
                >
                  {timeLabel(slot, timezone, locale)}
                </button>
              ))}
            </div>
          )}
        </>
      )}
      {valid && selected !== null ? (
        <p role="status">
          {en ? "Selected" : "已選擇"}：{when(selected, timezone, locale)}
        </p>
      ) : null}
    </div>
  );
}

export function BookingPage({ locale }: { locale: Locale }) {
  const { slug, id } = useParams(),
    [search, setSearch] = useSearchParams(),
    location = useLocation(),
    navigate = useNavigate(),
    { account } = useAccount(),
    en = locale === "en";
  const [provider, setProvider] = useState<PublicProvider | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [accepted, setAccepted] = useState(false),
    [slotValid, setSlotValid] = useState(false),
    [attempt, setAttempt] = useState(0);
  const key = useOperationKey(),
    service = provider?.services.find((s) => s.id === id),
    offering = service?.offerings[0];
  const date = search.get("date") ?? (service ? today(service.timezone) : ""),
    raw = search.get("start"),
    timestamp = Number(raw),
    selected =
      raw &&
      Number.isSafeInteger(timestamp) &&
      timestamp > 0 &&
      !Number.isNaN(new Date(timestamp).getTime())
        ? timestamp
        : null;
  function change(values: { date?: string; start?: number | null }) {
    const next = new URLSearchParams(search);
    if (values.date !== undefined) next.set("date", values.date);
    if (values.start !== undefined) {
      if (values.start === null) next.delete("start");
      else next.set("start", String(values.start));
    }
    setAccepted(false);
    setSearch(next, { replace: true });
  }
  useEffect(() => {
    if (raw !== null && selected === null) change({ start: null });
  }, [raw]);
  useEffect(() => {
    let active = true;
    setProvider(null);
    setError("");
    void api<PublicProvider>(`/providers/${slug}`)
      .then((v) => {
        if (active) setProvider(v);
      })
      .catch((e) => {
        if (active) setError(errorText(e, locale));
      });
    return () => {
      active = false;
    };
  }, [slug, id]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (
      busy ||
      !service ||
      !offering ||
      selected === null ||
      !slotValid ||
      !accepted ||
      !account
    )
      return;
    setBusy(true);
    setError("");
    const value = {
      serviceId: service.id,
      offeringId: offering.id,
      startsAt: selected,
      expectedServiceRevision: service.revision,
      acceptTerms: true,
    };
    try {
      const result = await api<{ id: string }>(
        service.mode === "REQUEST" ? "/booking-requests" : "/bookings",
        "POST",
        value,
        key(value),
      );
      navigate(
        service.mode === "REQUEST"
          ? `/app/requests/${result.id}`
          : `/app/bookings/${result.id}`,
      );
    } catch (e) {
      setError(errorText(e, locale));
      if (e instanceof ClientError && e.code === "SLOT_UNAVAILABLE") {
        setAttempt((a) => a + 1);
        change({ start: null });
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="workspace page-width booking-page">
      <p className="eyebrow">YOUR NEXT CONNECTION</p>
      <h1>{en ? "Find your time." : "為下一次服務，留個時間。"}</h1>
      <Link className="text-link" to={`/p/${slug}`}>
        {en ? "Back to provider" : "返回供給方頁面"} →
      </Link>
      {!provider && !error && (
        <p role="status">{en ? "Loading…" : "載入中…"}</p>
      )}
      {provider && !service && (
        <p role="alert">{en ? "Service unavailable" : "服務不存在或已下架"}</p>
      )}
      {service && offering && (
        <form className="stack-form" onSubmit={submit}>
          <div className="panel">
            <p>{provider?.publicName}</p>
            <h2>{service.name}</h2>
            <p>{service.description}</p>
            <p>
              {offering.durationMinutes} {en ? "minutes" : "分鐘"} ·{" "}
              {offering.priceMinor === null
                ? en
                  ? "Quote required"
                  : "待報價"
                : price(offering.priceMinor, offering.currency, locale)}
            </p>
            <p>
              {service.locationLabel} · {service.timezone}
            </p>
          </div>
          {offering.priceMinor === null ? (
            <p className="notice">
              {en
                ? "A price must be agreed before booking. Please contact your provider."
                : "待報價服務需先議定價格，目前請先聯絡供給方。"}
            </p>
          ) : (
            <>
              <div className="panel">
                <h2>{en ? "Choose a time" : "選擇時間"}</h2>
                {service.mode === "REQUEST" && (
                  <p className="notice">
                    {en
                      ? "This is a request, not a confirmed booking. No slot is held. It expires within 24 hours or at the booking notice deadline, whichever is earlier. The provider must respond; proposed time changes require your agreement."
                      : "這是預約申請，尚未確認，也不保留時段。申請會在 24 小時內或提前預約截止時到期，以較早者為準；需要供給方回覆，替代時間須經你同意。"}
                  </p>
                )}
                <TimePicker
                  key={`${id}-${attempt}`}
                  locale={locale}
                  timezone={service.timezone}
                  date={date}
                  onDate={(date) => change({ date, start: null })}
                  selected={selected}
                  onValidityChange={setSlotValid}
                  onSelect={(start) => change({ start })}
                  endpoint={(date) =>
                    `/services/${id}/availability?offeringId=${offering.id}&date=${date}`
                  }
                />
              </div>
              <div className="panel">
                <h2>{en ? "Before you confirm" : "確認前，請先閱讀"}</h2>
                <h3>{en ? "Cancellation policy" : "取消政策"}</h3>
                <p>{service.cancellationPolicy}</p>
                <p>
                  {en ? "Cancellation notice" : "取消需提前"}：
                  {service.cancellationNoticeMinutes} {en ? "minutes" : "分鐘"}
                </p>
                {selected !== null && (
                  <p>
                    {en
                      ? "Self-service cancellation deadline"
                      : "需求方自助取消截止"}
                    ：
                    {when(
                      selected - service.cancellationNoticeMinutes * 60_000,
                      service.timezone,
                      locale,
                    )}
                  </p>
                )}
                <p className="notice">
                  {offering.priceMinor === 0
                    ? en
                      ? "This service is free. No payment is required."
                      : "此服務免費，無須付款。"
                    : en
                      ? "Pay directly to your provider by your agreed method. KOVEYA does not collect or verify this service payment."
                      : "請依雙方約定方式直接向供給方付款。KOVEYA 不代收或驗證這筆服務款項。"}
                </p>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                    required
                  />
                  {en
                    ? "I agree to this service, price, time and cancellation policy."
                    : "我同意此服務、價格、所選時間及取消政策。"}
                </label>
                {!account ? (
                  <Link
                    className="button primary"
                    to={`/sign-in?returnTo=${encodeURIComponent(location.pathname + location.search)}`}
                  >
                    {en ? "Sign in to confirm" : "登入後確認預約"} →
                  </Link>
                ) : (
                  <button
                    className="button primary"
                    aria-busy={busy}
                    aria-describedby="booking-submit-help"
                    disabled={
                      busy || selected === null || !slotValid || !accepted
                    }
                  >
                    {busy
                      ? en
                        ? "Confirming…"
                        : "確認中…"
                      : en
                        ? service.mode === "REQUEST"
                          ? "Submit request"
                          : "Confirm booking"
                        : service.mode === "REQUEST"
                          ? "送出預約申請"
                          : "確認預約"}
                  </button>
                )}
                <p id="booking-submit-help" role="status">
                  {busy
                    ? en
                      ? "Submitting your booking. Please wait…"
                      : "正在送出預約，請稍候…"
                    : !slotValid
                      ? en
                        ? "Choose a date and an available time before submitting."
                        : "請先選擇日期與一個可用時段，才能送出。"
                      : !accepted
                        ? en
                          ? "Review and agree to the service terms before submitting."
                          : "請閱讀並勾選同意服務條件後送出。"
                        : en
                          ? "Your time is selected. You can now submit."
                          : "已選擇時段，可以送出。"}
                </p>
              </div>
            </>
          )}
        </form>
      )}
      <ErrorNotice message={error} />
    </section>
  );
}

const statusText = (status: Booking["status"], en: boolean) =>
  ({
    CONFIRMED: en ? "Confirmed" : "已確認",
    CANCELLED: en ? "Cancelled" : "已取消",
    COMPLETED: en ? "Completed" : "已完成",
    NO_SHOW: en ? "No show" : "未到場",
  })[status];
export function BookingList({
  locale,
  business = false,
}: {
  locale: Locale;
  business?: boolean;
}) {
  const [bookings, setBookings] = useState<Booking[] | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    en = locale === "en";
  useEffect(() => {
    let active = true;
    setError("");
    void api<Booking[]>(`/bookings?scope=${business ? "business" : "demand"}`)
      .then((v) => {
        if (active) setBookings(v);
      })
      .catch((e) => {
        if (active) setError(errorText(e, locale));
      });
    return () => {
      active = false;
    };
  }, [business, attempt]);
  return (
    <section className="workspace page-width">
      <p className="eyebrow">{business ? "KOVEYA BUSINESS" : "YOUR KOVEYA"}</p>
      <h1>
        {business
          ? en
            ? "Your bookings"
            : "預約管理"
          : en
            ? "My bookings"
            : "我的預約"}
      </h1>
      {business ? (
        <BusinessNav locale={locale} />
      ) : (
        <Link className="text-link" to="/app">
          {en ? "My workspace" : "我的工作台"} →
        </Link>
      )}
      {business && (
        <Link className="button primary" to="/business/bookings/new">
          {en ? "Record booking" : "手動新增預約"} +
        </Link>
      )}
      <ErrorNotice message={error} />
      {error && (
        <button
          className="button secondary"
          onClick={() => setAttempt((a) => a + 1)}
        >
          {en ? "Retry" : "重新載入"}
        </button>
      )}
      {!bookings && !error ? (
        <p role="status">{en ? "Loading bookings…" : "載入預約中…"}</p>
      ) : bookings?.length === 0 ? (
        <div className="empty-state">
          <h2>{en ? "Your next connection awaits." : "期待下一個連結。"}</h2>
          <p>{en ? "No bookings yet." : "目前還沒有預約。"}</p>
        </div>
      ) : (
        <div className="managed-services">
          {bookings?.map((b) => (
            <article key={b.id} className="panel managed-service">
              <div>
                <span className="status-badge">{statusText(b.status, en)}</span>
                <h2>{b.terms.serviceName}</h2>
                <p>
                  {when(b.startsAt, b.terms.timezone, locale)} ·{" "}
                  {b.terms.timezone}
                </p>
                <p>{business ? b.clientName : b.terms.providerName}</p>
              </div>
              <Link className="button secondary" to={`/app/bookings/${b.id}`}>
                {en ? "View booking" : "查看預約"} →
              </Link>
            </article>
          ))}
        </div>
      )}
      {bookings && bookings.length >= 200 && (
        <p className="notice">
          {en
            ? "Showing the latest 200 bookings."
            : "目前顯示最近 200 筆預約。"}
        </p>
      )}
    </section>
  );
}

export function BookingDetailPage({ locale }: { locale: Locale }) {
  const { id } = useParams(),
    en = locale === "en",
    [booking, setBooking] = useState<BookingDetail | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(""),
    [manualReason, setManualReason] = useState(""),
    [manualConsent, setManualConsent] = useState(false),
    [date, setDate] = useState(""),
    [selected, setSelected] = useState<number | null>(null),
    [slotValid, setSlotValid] = useState(false),
    [attempt, setAttempt] = useState(0),
    key = useOperationKey();
  async function load() {
    setBooking(await api<BookingDetail>(`/bookings/${id}`));
  }
  useEffect(() => {
    setError("");
    setBooking(null);
    void load().catch((e) => setError(errorText(e, locale)));
  }, [id]);
  async function action(path: string, value: unknown) {
    setBusy(true);
    setError("");
    try {
      await api(path, "POST", value, key({ path, value }));
      await load();
      setSelected(null);
      setReason("");
      setManualReason("");
      setManualConsent(false);
      setAttempt((a) => a + 1);
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="workspace page-width booking-page">
      <p className="eyebrow">YOUR CONNECTION</p>
      <h1>{en ? "Booking details" : "預約詳情"}</h1>
      <Link
        className="text-link"
        to={booking?.isProvider ? "/business/bookings" : "/app/bookings"}
      >
        {en ? "Back to bookings" : "返回預約列表"} →
      </Link>
      <ErrorNotice message={error} />
      {!booking && !error && <p role="status">{en ? "Loading…" : "載入中…"}</p>}
      {booking && (
        <>
          <div className="panel">
            <span className="status-badge">
              {statusText(booking.status, en)}
            </span>
            <h2>{booking.terms.serviceName}</h2>
            {booking.source === "PROVIDER_RECORDED" && (
              <p className="notice">
                {en
                  ? "Recorded by provider based on an agreement outside KOVEYA. This is not a verified customer confirmation."
                  : "此預約由供給方依平台外約定代為記錄，不代表平台驗證過客戶確認。"}
              </p>
            )}
            {booking.isProvider && booking.clientId && (
              <Link
                className="text-link"
                to={`/business/clients/${booking.clientId}`}
              >
                {en ? "View client" : "查看客戶資料"} →
              </Link>
            )}
            <CalendarDownload id={booking.id} locale={locale} />
            {booking.isProvider && !booking.clientHasAccount && (
              <p>
                {en
                  ? "This client has no linked account. Please contact them directly; they do not receive in-app notifications."
                  : "此客戶未連結帳號，不會收到站內通知，請直接聯絡。"}
              </p>
            )}
            <p>
              {booking.terms.providerName} · {booking.clientName}
            </p>
            <p>
              {when(booking.startsAt, booking.terms.timezone, locale)} –{" "}
              {timeLabel(booking.endsAt, booking.terms.timezone, locale)}
            </p>
            <p>
              {booking.terms.timezone} · {booking.terms.locationLabel}
            </p>
            <p>
              {price(booking.terms.priceMinor, booking.terms.currency, locale)}{" "}
              · {booking.terms.durationMinutes} {en ? "min" : "分鐘"}
            </p>
            <h3>
              {en ? "Agreed cancellation policy" : "預約成立時同意的取消政策"}
            </h3>
            <p>{booking.terms.cancellationPolicy}</p>
            <p>
              {en ? "Self-service cancellation deadline" : "需求方自助取消截止"}
              ：
              {when(
                booking.startsAt -
                  booking.terms.cancellationNoticeMinutes * 60_000,
                booking.terms.timezone,
                locale,
              )}
            </p>
            <p>
              {en
                ? "Payment arranged directly with provider"
                : "依約定方式直接向供給方付款"}
            </p>
            <p className="dev-note">
              {en ? "Booking reference" : "預約編號"}：{booking.id}
            </p>
            <p className="notice">
              {en
                ? "Email delivery is not enabled yet. View updates in Notifications."
                : "Email 寄送尚未啟用，可至「通知中心」查看異動。"}
            </p>
          </div>
          {booking.proposals.map((p) => (
            <div className="panel" key={p.id}>
              <h2>{en ? "Reschedule proposal" : "改期提案"}</h2>
              <p>
                {when(p.startsAt, booking.terms.timezone, locale)} ·{" "}
                {
                  (
                    {
                      PENDING: en ? "Awaiting reply" : "待回覆",
                      ACCEPTED: en ? "Accepted" : "已接受",
                      REJECTED: en ? "Declined" : "已拒絕",
                      CANCELLED: en ? "Closed" : "已結束",
                      EXPIRED: en ? "Expired" : "已到期",
                    } as Record<string, string>
                  )[p.status]
                }
              </p>
              {p.status === "PENDING" && (
                <>
                  <p>
                    {en ? "Reply before" : "請於此時間前回覆"}：
                    {when(p.expiresAt, booking.terms.timezone, locale)}
                  </p>
                  {p.canRespond ? (
                    <div className="button-row">
                      <button
                        aria-busy={Boolean(busy)}
                        className="button primary"
                        disabled={busy}
                        onClick={() =>
                          void action(`/reschedule-requests/${p.id}/accept`, {})
                        }
                      >
                        {en ? "Accept new time" : "接受新時間"}
                      </button>
                      <button
                        aria-busy={Boolean(busy)}
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          void action(`/reschedule-requests/${p.id}/reject`, {})
                        }
                      >
                        {en ? "Decline" : "拒絕改期"}
                      </button>
                    </div>
                  ) : (
                    <p>
                      {en
                        ? "Waiting for the other person. Your original time remains confirmed."
                        : "等待對方回覆中，原預約時間仍然保留。"}
                    </p>
                  )}
                </>
              )}
            </div>
          ))}
          {booking.status === "CONFIRMED" && booking.startsAt > Date.now() && (
            <>
              {booking.isProvider &&
              booking.source === "PROVIDER_RECORDED" &&
              !booking.clientHasAccount ? (
                <form
                  className="panel stack-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (
                      !busy &&
                      slotValid &&
                      selected !== null &&
                      manualConsent
                    )
                      void action(`/bookings/${id}/manual-reschedule`, {
                        expectedVersion: booking.version,
                        startsAt: selected,
                        confirmedWithClient: true,
                        reason: manualReason,
                      });
                  }}
                >
                  <h2>
                    {en ? "Record an agreed time change" : "記錄已約定的改期"}
                  </h2>
                  <p>
                    {en
                      ? "For contacts without an account, first agree the change directly with the client, then record it here. The original booking is preserved if the new time is unavailable."
                      : "未連結帳號的客戶，請先直接取得改期同意，再於此記錄。新時段無法使用時，原預約會保留。"}
                  </p>
                  <TimePicker
                    key={attempt}
                    locale={locale}
                    timezone={booking.terms.timezone}
                    date={date || today(booking.terms.timezone)}
                    onDate={setDate}
                    selected={selected}
                    onValidityChange={setSlotValid}
                    onSelect={(v) => {
                      setSelected(v);
                      setManualConsent(false);
                    }}
                    endpoint={(date) =>
                      `/bookings/${id}/availability?date=${date}`
                    }
                  />
                  <label htmlFor="manual-reschedule-reason">
                    {en ? "Reason" : "改期原因"}
                  </label>
                  <input
                    id="manual-reschedule-reason"
                    required
                    maxLength={500}
                    value={manualReason}
                    onChange={(e) => setManualReason(e.target.value)}
                  />
                  <label className="check-label">
                    <input
                      type="checkbox"
                      required
                      checked={manualConsent}
                      onChange={(e) => setManualConsent(e.target.checked)}
                    />
                    {en
                      ? "I have obtained the client's agreement outside KOVEYA and am recording the new time."
                      : "我已於平台外取得客戶同意，並代為記錄新時間。"}
                  </label>
                  <button
                    aria-busy={Boolean(busy)}
                    className="button primary"
                    disabled={
                      busy ||
                      !slotValid ||
                      selected === null ||
                      !manualConsent ||
                      !manualReason.trim()
                    }
                  >
                    {en ? "Record time change" : "確認記錄改期"}
                  </button>
                </form>
              ) : (
                <>
                  <form
                    className="panel stack-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!busy && slotValid && selected !== null)
                        void action(`/bookings/${id}/reschedule-requests`, {
                          expectedVersion: booking.version,
                          startsAt: selected,
                        });
                    }}
                  >
                    <h2>{en ? "Propose another time" : "提出改期"}</h2>
                    <p>
                      {en
                        ? "The original booking stays in place until the other person accepts. A new proposal replaces earlier unanswered proposals; the proposed time is not held."
                        : "對方接受前，原預約仍保留。新提案會取代尚未回覆的舊提案；提案時間不會預先占位。"}
                    </p>
                    <TimePicker
                      key={attempt}
                      locale={locale}
                      timezone={booking.terms.timezone}
                      date={date || today(booking.terms.timezone)}
                      onDate={setDate}
                      selected={selected}
                      onValidityChange={setSlotValid}
                      onSelect={setSelected}
                      endpoint={(date) =>
                        `/bookings/${id}/availability?date=${date}`
                      }
                    />
                    <button
                      aria-busy={Boolean(busy)}
                      className="button primary"
                      disabled={busy || !slotValid || selected === null}
                    >
                      {en ? "Send proposal" : "送出改期提案"}
                    </button>
                  </form>
                </>
              )}
              <form
                className="panel stack-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(`/bookings/${id}/cancel`, {
                    expectedVersion: booking.version,
                    reason,
                  });
                }}
              >
                <h2>{en ? "Cancel this booking" : "取消這筆預約"}</h2>
                <p>
                  {en
                    ? "Confirm cancellation only if you agree to the cancellation policy above. No refund is issued by KOVEYA."
                    : "確認取消代表依上述政策取消服務。KOVEYA 不會處理服務款項退款。"}
                </p>
                <label htmlFor="cancel-reason">
                  {en ? "Cancellation reason" : "取消原因"}
                </label>
                <input
                  id="cancel-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  maxLength={500}
                />
                <button
                  aria-busy={Boolean(busy)}
                  className="button secondary"
                  disabled={busy || !reason.trim()}
                >
                  {en ? "Confirm cancellation" : "確認取消預約"}
                </button>
              </form>
            </>
          )}
          <div className="panel">
            {booking.isProvider &&
              booking.status === "CONFIRMED" &&
              booking.endsAt <= Date.now() && (
                <div className="button-row">
                  <button
                    aria-busy={Boolean(busy)}
                    className="button primary"
                    disabled={busy}
                    onClick={() =>
                      void action(`/bookings/${id}/complete`, {
                        expectedVersion: booking.version,
                      })
                    }
                  >
                    {en ? "Mark completed" : "標記服務完成"}
                  </button>
                  <button
                    aria-busy={Boolean(busy)}
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      void action(`/bookings/${id}/no-show`, {
                        expectedVersion: booking.version,
                      })
                    }
                  >
                    {en ? "Mark no show" : "標記未到場"}
                  </button>
                </div>
              )}
            <h2>{en ? "Booking history" : "預約異動紀錄"}</h2>
            <ol className="booking-history">
              {booking.events.map((event, i) => (
                <li key={i}>
                  <strong>
                    {(
                      {
                        "booking.confirmed": en ? "Confirmed" : "預約成立",
                        "booking.completed": en ? "Completed" : "服務完成",
                        "booking.no_show": en ? "No show" : "未到場",
                        "booking.cancelled": en ? "Cancelled" : "預約取消",
                        "booking.reschedule_proposed": en
                          ? "New reschedule proposal"
                          : "提出改期",
                        "booking.rescheduled": en ? "Rescheduled" : "改期完成",
                        "booking.reschedule_rejected": en
                          ? "Reschedule declined"
                          : "拒絕改期",
                      } as Record<string, string>
                    )[event.eventType] ?? event.eventType}
                  </strong>
                  <p>
                    {when(event.createdAt, booking.terms.timezone, locale)}
                    {event.payload.reason ? ` · ${event.payload.reason}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </>
      )}
    </section>
  );
}

function minuteLabel(n: number) {
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
}
function IntervalFields({
  value,
  onChange,
  locale,
}: {
  value: Interval;
  onChange: (v: Interval) => void;
  locale: Locale;
}) {
  return (
    <div className="interval-fields">
      {(["start", "end"] as const).map((field) => (
        <label key={field}>
          {field === "start"
            ? locale === "en"
              ? "From"
              : "開始"
            : locale === "en"
              ? "Until"
              : "結束"}
          <select
            value={value[field]}
            onChange={(e) =>
              onChange({ ...value, [field]: Number(e.target.value) })
            }
          >
            {Array.from({ length: field === "end" ? 96 : 96 }, (_, i) =>
              field === "end" ? (i + 1) * 15 : i * 15,
            ).map((n) => (
              <option value={n} key={n}>
                {minuteLabel(n)}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}
export function AvailabilityPage({ locale }: { locale: Locale }) {
  const { account } = useAccount(),
    en = locale === "en",
    [schedule, setSchedule] = useState<Schedule | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!account?.business) return;
    setError("");
    void api<Schedule>("/business/availability")
      .then(setSchedule)
      .catch((e) => setError(errorText(e, locale)));
  }, [account?.business?.orgId, attempt]);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!schedule) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ revision: number }>(
        "/business/availability",
        "PUT",
        {
          expectedRevision: schedule.revision,
          timezone: schedule.timezone,
          rules: schedule.rules,
          exceptions: schedule.exceptions,
        },
      );
      setSchedule({ ...schedule, revision: result.revision });
      setNotice(en ? "Availability saved." : "可用時間已儲存。");
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setBusy(false);
    }
  }
  if (!account?.business) return <BusinessProfilePage locale={locale} />;
  return (
    <section className="workspace page-width">
      <p className="eyebrow">KOVEYA BUSINESS</p>
      <h1>{en ? "Make time for your clients." : "為你的客戶，安排好時間。"}</h1>
      <BusinessNav locale={locale} />
      <p className="notice">
        {en
          ? "All your services share these hours. Service duration and both buffers must fit within working hours. Changes affect new bookings; existing bookings stay confirmed."
          : "所有服務共用這份排班。服務與前後緩衝都必須落在可用時間內。排班變更影響新增預約，既有預約仍保留。"}
      </p>
      {!schedule && !error && (
        <p role="status">{en ? "Loading…" : "載入中…"}</p>
      )}
      {schedule && (
        <form className="stack-form" onSubmit={save}>
          <div className="panel">
            <label htmlFor="schedule-timezone">
              {en ? "Working-hours timezone" : "排班時區"}
            </label>
            <input
              id="schedule-timezone"
              required
              value={schedule.timezone}
              onChange={(e) =>
                setSchedule({ ...schedule, timezone: e.target.value })
              }
            />
            <h2>{en ? "Weekly hours" : "每週可用時間"}</h2>
            {Array.from({ length: 7 }, (_, weekday) => (
              <div className="schedule-day" key={weekday}>
                <h3>
                  {
                    (en
                      ? [
                          "Sunday",
                          "Monday",
                          "Tuesday",
                          "Wednesday",
                          "Thursday",
                          "Friday",
                          "Saturday",
                        ]
                      : [
                          "週日",
                          "週一",
                          "週二",
                          "週三",
                          "週四",
                          "週五",
                          "週六",
                        ])[weekday]
                  }
                </h3>
                {schedule.rules.filter((r) => r.weekday === weekday).length ===
                  0 && <p>{en ? "Closed" : "不開放"}</p>}
                {schedule.rules.map((r, index) =>
                  r.weekday === weekday ? (
                    <div className="schedule-interval" key={index}>
                      <IntervalFields
                        locale={locale}
                        value={r}
                        onChange={(v) =>
                          setSchedule({
                            ...schedule,
                            rules: schedule.rules.map((r, i) =>
                              i === index ? { ...v, weekday } : r,
                            ),
                          })
                        }
                      />
                      <button
                        className="text-link"
                        type="button"
                        onClick={() =>
                          setSchedule({
                            ...schedule,
                            rules: schedule.rules.filter((_, i) => i !== index),
                          })
                        }
                      >
                        {en ? "Remove" : "移除"}
                      </button>
                    </div>
                  ) : null,
                )}
                <button
                  className="button secondary"
                  type="button"
                  disabled={schedule.rules.length >= 28}
                  onClick={() =>
                    setSchedule({
                      ...schedule,
                      rules: [
                        ...schedule.rules,
                        { weekday, start: 540, end: 1080 },
                      ],
                    })
                  }
                >
                  {en ? "Add hours" : "新增時段"}
                </button>
              </div>
            ))}
          </div>
          <div className="panel">
            <h2>{en ? "Date exceptions" : "日期例外"}</h2>
            <p>
              {en
                ? "Exceptions replace weekly hours for that local date. Empty hours mean closed. Split overnight hours across two days."
                : "例外會取代當天的每週排班。沒有開放時段表示整天休假；跨午夜請拆成兩天設定。"}
            </p>
            {schedule.exceptions.map((exception, index) => (
              <div className="schedule-day" key={index}>
                <label>
                  {en ? "Exception date" : "例外日期"}
                  <input
                    type="date"
                    required
                    value={exception.date}
                    onChange={(e) =>
                      setSchedule({
                        ...schedule,
                        exceptions: schedule.exceptions.map((v, i) =>
                          i === index ? { ...v, date: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </label>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={exception.intervals.length === 0}
                    onChange={(e) =>
                      setSchedule({
                        ...schedule,
                        exceptions: schedule.exceptions.map((v, i) =>
                          i === index
                            ? {
                                ...v,
                                intervals: e.target.checked
                                  ? []
                                  : [{ start: 540, end: 1080 }],
                              }
                            : v,
                        ),
                      })
                    }
                  />
                  {en ? "Closed all day" : "整天休假"}
                </label>
                {exception.intervals.map((interval, j) => (
                  <IntervalFields
                    key={j}
                    locale={locale}
                    value={interval}
                    onChange={(v) =>
                      setSchedule({
                        ...schedule,
                        exceptions: schedule.exceptions.map((e, i) =>
                          i === index
                            ? {
                                ...e,
                                intervals: e.intervals.map((old, k) =>
                                  j === k ? v : old,
                                ),
                              }
                            : e,
                        ),
                      })
                    }
                  />
                ))}
                <button
                  className="text-link"
                  type="button"
                  onClick={() =>
                    setSchedule({
                      ...schedule,
                      exceptions: schedule.exceptions.filter(
                        (_, i) => i !== index,
                      ),
                    })
                  }
                >
                  {en ? "Remove exception" : "移除例外"}
                </button>
              </div>
            ))}
            <button
              className="button secondary"
              type="button"
              disabled={schedule.exceptions.length >= 60}
              onClick={() =>
                setSchedule({
                  ...schedule,
                  exceptions: [
                    ...schedule.exceptions,
                    { date: "", intervals: [] },
                  ],
                })
              }
            >
              {en ? "Add exception" : "新增日期例外"}
            </button>
          </div>
          <button
            aria-busy={Boolean(busy)}
            className="button primary"
            disabled={busy}
          >
            {busy
              ? en
                ? "Saving…"
                : "儲存中…"
              : en
                ? "Save availability"
                : "儲存可用時間"}
          </button>
        </form>
      )}
      {notice && (
        <p className="form-success" role="status">
          {notice}
        </p>
      )}
      <ErrorNotice message={error} />
      {error && (
        <button
          className="button secondary"
          onClick={() => setAttempt((a) => a + 1)}
        >
          {en ? "Reload saved hours" : "重新載入已存排班"}
        </button>
      )}
    </section>
  );
}

function CalendarDownload({ id, locale }: { id: string; locale: Locale }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/v1/bookings/${encodeURIComponent(id)}/calendar.ics`,
        { credentials: "same-origin" },
      );
      if (!response.ok) {
        const result = (await response.json()) as { error?: { code?: string } };
        throw new ClientError(result.error?.code ?? "INTERNAL_ERROR");
      }
      if (!response.headers.get("Content-Type")?.startsWith("text/calendar"))
        throw new Error("Invalid calendar response");
      const url = URL.createObjectURL(await response.blob()),
        link = document.createElement("a");
      link.href = url;
      link.download = "koveya-booking.ics";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <button
        aria-busy={Boolean(busy)}
        className="button secondary"
        type="button"
        disabled={busy}
        onClick={() => void download()}
      >
        {busy
          ? locale === "en"
            ? "Preparing…"
            : "準備中…"
          : locale === "en"
            ? "Export calendar (.ics)"
            : "匯出行事曆（.ics）"}
      </button>
      <p>
        {locale === "en"
          ? "This file is a snapshot, not automatic calendar sync. Re-export after changes; how an import updates an existing event depends on your calendar app."
          : "此檔案為當下快照，不會自動同步。預約變更後請重新匯出；匯入是否更新原事件，依你的行事曆支援而定。"}
      </p>
      <ErrorNotice message={error} />
    </div>
  );
}
