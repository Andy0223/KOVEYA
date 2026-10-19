import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Locale } from "../shared/account";
import type {
  BookingRequest,
  RequestDetail,
  Notification,
} from "../shared/booking";
import { api, errorText, useAccount } from "./account";
import { BusinessNav } from "./business-pages";
import {
  ErrorNotice,
  price,
  today,
  when,
  TimePicker,
  useOperationKey,
} from "./booking-pages";

export function eventLabel(event: string, en: boolean) {
  return (
    (
      {
        "request.submitted": ["預約申請已送出", "Booking request submitted"],
        "request.counter_proposed": [
          "收到替代時間提案",
          "Alternative time proposed",
        ],
        "request.accepted": ["預約申請已接受", "Booking request accepted"],
        "request.rejected": ["預約申請已拒絕", "Booking request rejected"],
        "request.withdrawn": ["預約申請已撤回", "Booking request withdrawn"],
        "request.declined": ["替代時間已拒絕", "Alternative time declined"],
        "request.expired": ["預約申請已到期", "Booking request expired"],
        "booking.confirmed": ["預約已確認", "Booking confirmed"],
        "booking.cancelled": ["預約已取消", "Booking cancelled"],
        "booking.reschedule_proposed": ["收到改期提案", "Reschedule proposed"],
        "booking.rescheduled": ["預約改期完成", "Booking rescheduled"],
        "booking.reschedule_rejected": [
          "改期提案已拒絕",
          "Reschedule declined",
        ],
        "booking.completed": ["服務已完成", "Service completed"],
        "booking.no_show": ["服務已標記未到場", "Service marked no show"],
      } as Record<string, string[]>
    )[event]?.[en ? 1 : 0] ?? (en ? "Service update" : "服務狀態更新")
  );
}
const requestStatus = (status: BookingRequest["status"], en: boolean) =>
  ({
    SUBMITTED: en ? "Awaiting provider" : "待供給方確認",
    COUNTER_PROPOSED: en ? "Awaiting customer" : "待需求方確認替代時間",
    ACCEPTED: en ? "Accepted" : "已接受",
    REJECTED: en ? "Rejected" : "已拒絕",
    WITHDRAWN: en ? "Withdrawn" : "已撤回",
    DECLINED: en ? "Declined" : "已拒絕替代時間",
    EXPIRED: en ? "Expired" : "已到期",
  })[status];
export function RequestList({
  locale,
  business = false,
}: {
  locale: Locale;
  business?: boolean;
}) {
  const en = locale === "en",
    [items, setItems] = useState<BookingRequest[] | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    void api<BookingRequest[]>(
      `/booking-requests?scope=${business ? "business" : "demand"}`,
    )
      .then((v) => {
        if (active) setItems(v);
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
      <h1>{en ? "Booking requests" : "預約申請"}</h1>
      {business ? (
        <BusinessNav locale={locale} />
      ) : (
        <div className="button-row">
          <Link to="/app">{en ? "My workspace" : "我的工作台"}</Link>
          <Link to="/app/bookings">{en ? "My bookings" : "我的預約"}</Link>
        </div>
      )}
      <p className="notice">
        {en
          ? "Requests do not hold a time. A booking is confirmed only after acceptance and a final availability check."
          : "申請不會占用時段。接受時會再次檢查，成功後才建立已確認預約。"}
      </p>
      <ErrorNotice message={error} />
      <button
        className="button secondary"
        onClick={() => setAttempt((a) => a + 1)}
      >
        {en ? "Refresh" : "重新整理"}
      </button>
      {!items && !error ? (
        <p role="status">{en ? "Loading…" : "載入中…"}</p>
      ) : items?.length === 0 ? (
        <div className="empty-state">
          <p>{en ? "No requests yet." : "目前沒有預約申請。"}</p>
        </div>
      ) : (
        <div className="managed-services">
          {items?.map((r) => (
            <article className="panel managed-service" key={r.id}>
              <div>
                <span className="status-badge">
                  {requestStatus(r.status, en)}
                </span>
                <h2>{r.terms.serviceName}</h2>
                <p>
                  {when(r.startsAt, r.terms.timezone, locale)} ·{" "}
                  {r.terms.timezone}
                </p>
                <p>{business ? r.clientName : r.terms.providerName}</p>
              </div>
              <Link className="button secondary" to={`/app/requests/${r.id}`}>
                {en ? "Review request" : "查看申請"} →
              </Link>
            </article>
          ))}
        </div>
      )}
      {items && items.length >= 100 && (
        <p className="notice">
          {en
            ? "Showing the latest 100 requests."
            : "目前顯示最近 100 筆申請。"}
        </p>
      )}
    </section>
  );
}
export function RequestDetailPage({ locale }: { locale: Locale }) {
  const { id } = useParams(),
    en = locale === "en",
    [item, setItem] = useState<RequestDetail | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reason, setReason] = useState(""),
    [date, setDate] = useState(""),
    [selected, setSelected] = useState<number | null>(null),
    [slotValid, setSlotValid] = useState(false),
    [accepted, setAccepted] = useState(false),
    [refresh, setRefresh] = useState(0),
    key = useOperationKey();
  async function load() {
    setItem(await api<RequestDetail>(`/booking-requests/${id}`));
  }
  useEffect(() => {
    setError("");
    void load().catch((e) => setError(errorText(e, locale)));
  }, [id, refresh]);
  async function action(action: string, extra: object = {}) {
    if (!item) return;
    const value = { expectedVersion: item.version, ...extra };
    setBusy(true);
    setError("");
    try {
      await api(
        `/booking-requests/${id}/${action}`,
        "POST",
        value,
        key({ id, action, value }),
      );
      await load();
      setAccepted(false);
      setReason("");
      setSelected(null);
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setBusy(false);
    }
  }
  const live =
      item &&
      ["SUBMITTED", "COUNTER_PROPOSED"].includes(item.status) &&
      item.expiresAt > Date.now(),
    canAccept =
      live &&
      (item.status === "SUBMITTED" ? item.isProvider : !item.isProvider);
  return (
    <section className="workspace page-width booking-page">
      <p className="eyebrow">YOUR CONNECTION</p>
      <h1>{en ? "Request details" : "預約申請詳情"}</h1>
      <div className="button-row">
        <Link
          className="text-link"
          to={item?.isProvider ? "/business/requests" : "/app/requests"}
        >
          {en ? "Back to requests" : "返回申請列表"} →
        </Link>
        <button
          aria-busy={Boolean(busy)}
          className="button secondary"
          disabled={busy}
          onClick={() => {
            setAccepted(false);
            setRefresh((a) => a + 1);
          }}
        >
          {en ? "Refresh" : "重新整理"}
        </button>
      </div>
      <ErrorNotice message={error} />
      {!item && !error && <p role="status">{en ? "Loading…" : "載入中…"}</p>}
      {item && (
        <>
          <div className="panel">
            <span className="status-badge">
              {requestStatus(item.status, en)}
            </span>
            <h2>{item.terms.serviceName}</h2>
            <p>
              {item.terms.providerName} · {item.clientName}
            </p>
            <p>
              {when(item.startsAt, item.terms.timezone, locale)} ·{" "}
              {item.terms.timezone}
            </p>
            {item.originalStartsAt !== item.startsAt && (
              <p>
                {en ? "Originally requested" : "原申請時間"}：
                {when(item.originalStartsAt, item.terms.timezone, locale)}
              </p>
            )}
            <p>{item.terms.locationLabel}</p>
            <p>
              {price(item.terms.priceMinor, item.terms.currency, locale)} ·{" "}
              {item.terms.durationMinutes} {en ? "min" : "分鐘"}
            </p>
            <h3>{en ? "Agreed cancellation policy" : "原同意的取消政策"}</h3>
            <p>{item.terms.cancellationPolicy}</p>
            <p>
              {en ? "Cancellation notice (minutes)" : "取消需提前（分鐘）"}：
              {item.terms.cancellationNoticeMinutes}
            </p>
            {live && (
              <>
                <p>
                  {en ? "Reply deadline" : "回覆截止"}：
                  {when(item.expiresAt, item.terms.timezone, locale)}
                </p>
                <p className="notice">
                  {en
                    ? "This request does not hold a slot. Availability will be checked again on acceptance."
                    : "此申請不保留時段，接受時將重新檢查可用性。"}
                </p>
              </>
            )}
            {item.bookingId && (
              <Link
                className="button primary"
                to={`/app/bookings/${item.bookingId}`}
              >
                {en ? "View confirmed booking" : "查看已確認預約"} →
              </Link>
            )}
          </div>
          {canAccept && (
            <form
              className="panel stack-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (accepted) void action("accept", { acceptTerms: true });
              }}
            >
              <h2>
                {item.status === "COUNTER_PROPOSED"
                  ? en
                    ? "Confirm the alternative time"
                    : "確認替代時間"
                  : en
                    ? "Accept this request"
                    : "接受這筆申請"}
              </h2>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={accepted}
                  onChange={(e) => setAccepted(e.target.checked)}
                  required
                />
                {en
                  ? "I confirm the service, price, time and policy shown above."
                  : "我確認上述服務、價格、時間與政策。"}
              </label>
              <button
                aria-busy={Boolean(busy)}
                className="button primary"
                disabled={busy || !accepted}
              >
                {en ? "Accept and confirm booking" : "接受並確認預約"}
              </button>
            </form>
          )}
          {live && item.isProvider && (
            <form
              className="panel stack-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy && slotValid && selected !== null)
                  void action("counter-proposals", { startsAt: selected });
              }}
            >
              <h2>{en ? "Suggest another time" : "提議替代時間"}</h2>
              <p>
                {en
                  ? "The customer must accept. Price and policy stay unchanged; the deadline is not extended."
                  : "需由需求方確認。價格與政策不變，回覆期限不延長。"}
              </p>
              <TimePicker
                locale={locale}
                timezone={item.terms.timezone}
                date={date || today(item.terms.timezone)}
                onDate={setDate}
                selected={selected}
                onValidityChange={setSlotValid}
                onSelect={setSelected}
                endpoint={(d) =>
                  `/booking-requests/${id}/availability?date=${d}`
                }
              />
              <button
                aria-busy={Boolean(busy)}
                className="button secondary"
                disabled={busy || !slotValid || selected === null}
              >
                {en ? "Send alternative time" : "送出替代時間"}
              </button>
            </form>
          )}
          {live && (
            <form
              className="panel stack-form"
              onSubmit={(e) => {
                e.preventDefault();
                void action(
                  item.isProvider
                    ? "reject"
                    : item.status === "COUNTER_PROPOSED"
                      ? "decline"
                      : "withdraw",
                  { reason },
                );
              }}
            >
              <h2>
                {item.isProvider
                  ? en
                    ? "Reject request"
                    : "拒絕申請"
                  : item.status === "COUNTER_PROPOSED"
                    ? en
                      ? "Decline alternative time"
                      : "拒絕替代時間"
                    : en
                      ? "Withdraw request"
                      : "撤回申請"}
              </h2>
              <label htmlFor="request-reason">{en ? "Reason" : "原因"}</label>
              <input
                id="request-reason"
                required
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <button
                aria-busy={Boolean(busy)}
                className="button secondary"
                disabled={busy || !reason.trim()}
              >
                {en ? "Confirm" : "確認送出"}
              </button>
            </form>
          )}
          <div className="panel">
            <h2>{en ? "Request history" : "申請異動紀錄"}</h2>
            <ol className="booking-history">
              {item.events.map((event, i) => (
                <li key={i}>
                  <strong>{eventLabel(event.eventType, en)}</strong>
                  <p>
                    {when(event.createdAt, item.terms.timezone, locale)}
                    {event.payload.reason ? ` · ${event.payload.reason}` : ""}
                  </p>
                </li>
              ))}
            </ol>
          </div>
          <p className="notice">
            {en
              ? "Service updates are in Notifications. Email delivery is not enabled yet."
              : "可在通知中心查看異動；Email 寄送尚未啟用。"}
          </p>
        </>
      )}
    </section>
  );
}
export function NotificationPage({ locale }: { locale: Locale }) {
  const { account } = useAccount();
  const en = locale === "en",
    [data, setData] = useState<{
      items: Notification[];
      unread: number;
    } | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [busy, setBusy] = useState<string | null>(null);
  async function load() {
    setData(await api("/notifications"));
  }
  useEffect(() => {
    setError("");
    void load().catch((e) => setError(errorText(e, locale)));
  }, [attempt]);
  async function mark(id: string) {
    setBusy(id);
    setError("");
    try {
      await api(`/notifications/${encodeURIComponent(id)}/read`, "POST");
      await load();
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setBusy(null);
    }
  }
  return (
    <section className="workspace page-width">
      <p className="eyebrow">YOUR KOVEYA</p>
      <h1>{en ? "Notifications" : "通知中心"}</h1>
      <p>
        {en ? "Unread" : "未讀"}：{data?.unread ?? "—"}
      </p>
      <p className="notice">
        {en
          ? "In-app service updates. Email delivery is not enabled. A notification does not mean the other person has read or agreed to a change."
          : "此處提供站內服務通知；Email 寄送尚未啟用。通知送出不代表對方已讀或同意異動。"}
      </p>
      <div className="button-row">
        <Link to="/app/bookings">{en ? "My bookings" : "我的預約"}</Link>
        <Link to="/app/requests">{en ? "My requests" : "我的預約申請"}</Link>
        <button
          className="button secondary"
          onClick={() => setAttempt((a) => a + 1)}
        >
          {en ? "Refresh" : "重新整理"}
        </button>
      </div>
      <ErrorNotice message={error} />
      {!data && !error ? (
        <p role="status">{en ? "Loading…" : "載入中…"}</p>
      ) : data?.items.length === 0 ? (
        <div className="empty-state">
          <p>{en ? "No notifications yet." : "目前沒有通知。"}</p>
        </div>
      ) : (
        <div className="managed-services">
          {data?.items.map((n) => (
            <article className="panel managed-service" key={n.id}>
              <div>
                {n.readAt === null && (
                  <span className="status-badge">{en ? "Unread" : "未讀"}</span>
                )}
                <h2>{eventLabel(n.eventType, en)}</h2>
                <p>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: account?.user.timezone,
                  }).format(n.createdAt)}
                </p>
              </div>
              <div className="button-row">
                <Link
                  className="button secondary"
                  to={`/app/${n.entityType === "REQUEST" ? "requests" : "bookings"}/${n.entityId}`}
                >
                  {en ? "View details" : "查看詳情"} →
                </Link>
                {n.readAt === null && (
                  <button
                    aria-busy={busy === n.id}
                    className="button secondary"
                    disabled={busy === n.id}
                    onClick={() => void mark(n.id)}
                  >
                    {en ? "Mark as read" : "標記已讀"}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
      {data && data.items.length >= 100 && (
        <p className="notice">
          {en
            ? "Showing the latest 100 notifications."
            : "目前顯示最近 100 筆通知。"}
        </p>
      )}
    </section>
  );
}
