import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import type { Locale, ManagedService } from "../shared/account";
import type {
  Client,
  ClientDetail,
  ClientList,
  MyProvider,
} from "../shared/clients";
import { api, errorText, useAccount } from "./account";
import { BusinessNav, BusinessProfilePage } from "./business-pages";
import {
  ErrorNotice,
  price,
  today,
  when,
  TimePicker,
  useOperationKey,
} from "./booking-pages";

function Pager({
  total,
  offset,
  limit,
  onChange,
  locale,
}: {
  total: number;
  offset: number;
  limit: number;
  onChange: (offset: number) => void;
  locale: Locale;
}) {
  const en = locale === "en";
  return (
    <div className="button-row">
      <p>
        {total === 0 ? "0" : `${offset + 1}–${Math.min(total, offset + limit)}`}{" "}
        / {total}
      </p>
      <button
        className="button secondary"
        type="button"
        disabled={offset === 0}
        onClick={() => onChange(Math.max(0, offset - limit))}
      >
        {en ? "Previous" : "上一頁"}
      </button>
      <button
        className="button secondary"
        type="button"
        disabled={offset + limit >= total}
        onClick={() => onChange(offset + limit)}
      >
        {en ? "Next" : "下一頁"}
      </button>
    </div>
  );
}
export function ClientListPage({ locale }: { locale: Locale }) {
  const en = locale === "en",
    { account } = useAccount(),
    [search, setSearch] = useSearchParams(),
    [q, setQ] = useState(search.get("q") ?? ""),
    [data, setData] = useState<ClientList | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const query = search.toString();
  useEffect(() => {
    if (!account?.business) return;
    let active = true;
    setData(null);
    setError("");
    void api<ClientList>(`/clients?${query}`)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(errorText(e, locale));
      });
    return () => {
      active = false;
    };
  }, [query, attempt, account?.business?.orgId]);
  if (!account?.business) return <BusinessProfilePage locale={locale} />;
  return (
    <section className="workspace page-width">
      <p className="eyebrow">KOVEYA BUSINESS</p>
      <h1>{en ? "Your client relationships" : "你的客戶關係"}</h1>
      <BusinessNav locale={locale} />
      <div className="button-row">
        <Link className="button primary" to="/business/clients/new">
          {en ? "Add client" : "新增客戶"} +
        </Link>
        <Link className="button secondary" to="/business/bookings/new">
          {en ? "Record booking" : "手動新增預約"}
        </Link>
      </div>
      <form
        className="panel stack-form"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(q ? { q } : {});
        }}
      >
        <label htmlFor="client-search">
          {en ? "Search name, email or phone" : "搜尋姓名、Email 或電話"}
        </label>
        <input
          id="client-search"
          maxLength={80}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="button secondary">{en ? "Search" : "搜尋"}</button>
      </form>
      <ErrorNotice message={error} />
      {error && (
        <button
          className="button secondary"
          onClick={() => setAttempt((a) => a + 1)}
        >
          {en ? "Retry" : "重新載入"}
        </button>
      )}
      {!data && !error ? (
        <p role="status">{en ? "Loading clients…" : "正在載入客戶…"}</p>
      ) : data?.items.length === 0 ? (
        <div className="empty-state">
          <p>{en ? "No matching clients." : "目前沒有符合的客戶。"}</p>
        </div>
      ) : (
        <div className="managed-services">
          {data?.items.map((c) => (
            <article key={c.id} className="panel managed-service">
              <div>
                <span className="status-badge">
                  {c.linkedAccount
                    ? en
                      ? "Platform client"
                      : "平台客戶"
                    : en
                      ? "Contact record"
                      : "聯絡紀錄"}
                </span>
                <h2>{c.name}</h2>
                <p className="contact-value">
                  {c.email ??
                    c.phone ??
                    (en ? "No contact information" : "尚無聯絡資訊")}
                </p>
                <p>
                  {en ? "Bookings" : "預約"} {c.bookingCount} ·{" "}
                  {en ? "Completed" : "已完成"} {c.completedCount}
                </p>
                {c.nextBookingAt !== null && (
                  <p>
                    {en ? "Next" : "下一筆"}：
                    {when(c.nextBookingAt, account.user.timezone, locale)} ·{" "}
                    {account.user.timezone}
                  </p>
                )}
              </div>
              <Link
                className="button secondary"
                to={`/business/clients/${c.id}`}
              >
                {en ? "View client" : "查看客戶"} →
              </Link>
            </article>
          ))}
        </div>
      )}
      {data && (
        <Pager
          {...data}
          locale={locale}
          onChange={(offset) => {
            const next = new URLSearchParams(search);
            next.set("offset", String(offset));
            setSearch(next);
          }}
        />
      )}
    </section>
  );
}
export function ClientDetailPage({ locale }: { locale: Locale }) {
  const { id } = useParams(),
    en = locale === "en",
    { account } = useAccount(),
    navigate = useNavigate(),
    [search, setSearch] = useSearchParams(),
    [detail, setDetail] = useState<ClientDetail | null>(null),
    [form, setForm] = useState({ name: "", email: "", phone: "" }),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [attempt, setAttempt] = useState(0),
    key = useOperationKey();
  const query = search.toString();
  useEffect(() => {
    setDetail(null);
    setError("");
    if (!id || !account?.business) return;
    let active = true;
    void api<ClientDetail>(`/clients/${id}?${query}`)
      .then((v) => {
        if (active) {
          setDetail(v);
          setForm({
            name: v.client.name,
            email: v.client.email ?? "",
            phone: v.client.phone ?? "",
          });
        }
      })
      .catch((e) => {
        if (active) setError(errorText(e, locale));
      });
    return () => {
      active = false;
    };
  }, [id, query, attempt, account?.business?.orgId]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    const value = {
      name: form.name,
      email: form.email || null,
      phone: form.phone || null,
      ...(detail ? { expectedRevision: detail.client.revision } : {}),
    };
    try {
      if (id) {
        await api(`/clients/${id}`, "PATCH", value);
        setAttempt((a) => a + 1);
        setNotice(en ? "Contact saved." : "客戶聯絡資料已儲存。");
      } else {
        const result = await api<{ id: string }>(
          "/clients",
          "POST",
          value,
          key(value),
        );
        navigate(`/business/clients/${result.id}`);
      }
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
      <h1>
        {id
          ? (detail?.client.name ?? (en ? "Client details" : "客戶詳情"))
          : en
            ? "Add a client"
            : "新增客戶"}
      </h1>
      <BusinessNav locale={locale} />
      <Link className="text-link" to="/business/clients">
        {en ? "Back to clients" : "返回客戶清單"} →
      </Link>
      <p className="notice">
        {en
          ? "These contacts belong to your business. Editing them does not change the client's account or sign-in email. A matching email never links an account automatically."
          : "這是你的業務聯絡資料。修改不會變更客戶帳號或登入 Email，也不會因 Email 相同就自動連結帳號。"}
      </p>
      {id && !detail && !error && (
        <p role="status">{en ? "Loading…" : "載入中…"}</p>
      )}
      {(!id || detail) && (
        <form className="panel stack-form" onSubmit={save}>
          <label htmlFor="client-name">{en ? "Client name" : "客戶姓名"}</label>
          <input
            id="client-name"
            required
            maxLength={120}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <label htmlFor="client-email">
            {en ? "Contact email (optional)" : "聯絡 Email（選填）"}
          </label>
          <input
            id="client-email"
            type="email"
            maxLength={254}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <label htmlFor="client-phone">
            {en ? "Phone (optional)" : "電話（選填）"}
          </label>
          <input
            id="client-phone"
            type="tel"
            maxLength={40}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <button
            aria-busy={Boolean(busy)}
            className="button primary"
            disabled={busy}
          >
            {busy
              ? en
                ? "Saving…"
                : "儲存中…"
              : id
                ? en
                  ? "Save contact"
                  : "儲存聯絡資料"
                : en
                  ? "Create client"
                  : "建立客戶"}
          </button>
        </form>
      )}
      <ErrorNotice message={error} />
      {error && id && (
        <button
          className="button secondary"
          onClick={() => setAttempt((a) => a + 1)}
        >
          {en ? "Reload saved details" : "重新載入已儲存資料"}
        </button>
      )}
      {notice && (
        <p className="form-success" role="status">
          {notice}
        </p>
      )}
      {detail && (
        <>
          <div className="panel">
            <h2>{en ? "Service relationship" : "服務關係"}</h2>
            <p>
              {detail.client.linkedAccount
                ? en
                  ? "This client has a linked platform account."
                  : "此客戶已連結平台帳號。"
                : en
                  ? "This contact is not linked to a platform account. In-app updates are available to you; contact the client directly."
                  : "此聯絡紀錄未連結平台帳號。站內更新僅提供給你，請直接聯絡客戶。"}
            </p>
            <p>
              {en ? "Bookings" : "預約"} {detail.client.bookingCount} ·{" "}
              {en ? "Completed" : "已完成"} {detail.client.completedCount}
            </p>
            <Link
              className="button primary"
              to={`/business/bookings/new?clientId=${id}`}
            >
              {en ? "Record a booking" : "為此客戶新增預約"} +
            </Link>
          </div>
          <h2>{en ? "Booking history" : "客戶預約歷史"}</h2>
          {detail.bookings.length === 0 ? (
            <p className="notice">
              {en ? "No bookings for this client yet." : "此客戶目前沒有預約。"}
            </p>
          ) : (
            <div className="managed-services">
              {detail.bookings.map((b) => (
                <article className="panel managed-service" key={b.id}>
                  <div>
                    <h3>{b.terms.serviceName}</h3>
                    <p>
                      {when(b.startsAt, b.terms.timezone, locale)} ·{" "}
                      {b.terms.timezone}
                    </p>
                    <p>
                      {
                        {
                          CONFIRMED: en ? "Confirmed" : "已確認",
                          CANCELLED: en ? "Cancelled" : "已取消",
                          COMPLETED: en ? "Completed" : "已完成",
                          NO_SHOW: en ? "No show" : "未到場",
                        }[b.status]
                      }
                    </p>
                  </div>
                  <Link
                    className="button secondary"
                    to={`/app/bookings/${b.id}`}
                  >
                    {en ? "View booking" : "查看預約"}
                  </Link>
                </article>
              ))}
            </div>
          )}
          <Pager
            locale={locale}
            total={detail.totalBookings}
            offset={detail.offset}
            limit={detail.limit}
            onChange={(offset) => setSearch({ offset: String(offset) })}
          />
        </>
      )}
    </section>
  );
}
export function ManualBookingPage({ locale }: { locale: Locale }) {
  const en = locale === "en",
    { account } = useAccount(),
    [search] = useSearchParams(),
    navigate = useNavigate(),
    [clients, setClients] = useState<Client[]>([]),
    [chosen, setChosen] = useState<Client | null>(null),
    [clientId, setClientId] = useState(search.get("clientId") ?? ""),
    [query, setQuery] = useState(""),
    [q, setQ] = useState(""),
    [services, setServices] = useState<ManagedService[]>([]),
    [serviceId, setServiceId] = useState(""),
    [date, setDate] = useState(""),
    [selected, setSelected] = useState<number | null>(null),
    [slotValid, setSlotValid] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    key = useOperationKey();
  useEffect(() => {
    if (!account?.business) return;
    let active = true;
    void api<ManagedService[]>("/business/services")
      .then((v) => {
        if (active) {
          setServices(
            v.filter((s) => s.status === "PUBLISHED" && s.priceMinor !== null),
          );
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(errorText(e, locale));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [account?.business?.orgId]);
  useEffect(() => {
    if (!account?.business) return;
    let active = true;
    void api<ClientList>(`/clients?q=${encodeURIComponent(q)}`)
      .then((v) => {
        if (active) setClients(v.items);
      })
      .catch((e) => {
        if (active) setError(errorText(e, locale));
      });
    return () => {
      active = false;
    };
  }, [q, account?.business?.orgId]);
  useEffect(() => {
    setChosen(null);
    if (!clientId) return;
    let active = true;
    void api<ClientDetail>(`/clients/${clientId}`)
      .then((v) => {
        if (active) setChosen(v.client);
      })
      .catch((e) => {
        if (active) setError(errorText(e, locale));
      });
    return () => {
      active = false;
    };
  }, [clientId]);
  const service = services.find((s) => s.id === serviceId);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (
      busy ||
      !slotValid ||
      !service ||
      !chosen ||
      !confirmed ||
      selected === null
    )
      return;
    setBusy(true);
    setError("");
    const value = {
      clientId,
      serviceId: service.id,
      offeringId: service.offeringId,
      startsAt: selected,
      expectedServiceRevision: service.revision,
      confirmedWithClient: true,
    };
    try {
      const result = await api<{ id: string }>(
        "/business/bookings",
        "POST",
        value,
        key(value),
      );
      navigate(`/app/bookings/${result.id}`);
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setBusy(false);
    }
  }
  if (!account?.business) return <BusinessProfilePage locale={locale} />;
  return (
    <section className="workspace page-width booking-page">
      <p className="eyebrow">KOVEYA BUSINESS</p>
      <h1>{en ? "Record an agreed booking" : "手動記錄已約定的預約"}</h1>
      <BusinessNav locale={locale} />
      <p className="notice">
        {en
          ? "Record future arrangements already agreed with your client. Working hours, buffers and conflicts still apply; customer minimum notice does not apply. This records your confirmation, not a verified customer action."
          : "可記錄已與客戶約定的未來安排。仍遵守排班、緩衝及防撞規則，但不受需求方提前預約限制。這是你的代為確認紀錄，不代表平台驗證過客戶同意。"}
      </p>
      {loading ? (
        <p role="status">{en ? "Loading…" : "載入中…"}</p>
      ) : services.length === 0 ? (
        <p className="notice">
          {en
            ? "First publish a fixed-price or free service. Draft, unpublished and quote services cannot accept new bookings."
            : "請先發布固定價格或免費服務。草稿、已下架與待報價服務不能新增預約。"}
        </p>
      ) : (
        <form className="stack-form" onSubmit={submit}>
          <div className="panel">
            <h2>{en ? "Client & service" : "客戶與服務"}</h2>
            <label htmlFor="manual-client-search">
              {en ? "Find client" : "尋找客戶"}
            </label>
            <div className="button-row">
              <input
                id="manual-client-search"
                maxLength={80}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <button
                className="button secondary"
                type="button"
                onClick={() => setQ(query)}
              >
                {en ? "Search" : "搜尋客戶"}
              </button>
            </div>
            <label htmlFor="manual-client">{en ? "Client" : "選擇客戶"}</label>
            <select
              id="manual-client"
              required
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value);
                setConfirmed(false);
              }}
            >
              <option value="">{en ? "Choose a client" : "請選擇客戶"}</option>
              {chosen && !clients.some((c) => c.id === chosen.id) && (
                <option value={chosen.id}>{chosen.name}</option>
              )}
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ·{" "}
                  {c.linkedAccount
                    ? en
                      ? "Platform account"
                      : "平台帳號"
                    : en
                      ? "Contact record"
                      : "聯絡紀錄"}
                </option>
              ))}
            </select>
            {chosen && (
              <p className="contact-value">
                {chosen.name} ·{" "}
                {chosen.email ??
                  chosen.phone ??
                  (en ? "No contact information" : "尚無聯絡資訊")}
              </p>
            )}
            <p>
              {en
                ? "Showing up to 50 matches; narrow your search for more."
                : "最多顯示 50 筆符合結果，可用搜尋縮小範圍。"}
            </p>
            <Link className="text-link" to="/business/clients/new">
              {en ? "Add a new client" : "新增客戶"} +
            </Link>
            <label htmlFor="manual-service">
              {en ? "Service" : "選擇服務"}
            </label>
            <select
              id="manual-service"
              required
              value={serviceId}
              onChange={(e) => {
                setServiceId(e.target.value);
                setSelected(null);
                setDate("");
                setConfirmed(false);
              }}
            >
              <option value="">{en ? "Choose a service" : "請選擇服務"}</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          {service && (
            <>
              <div className="panel">
                <h2>{service.name}</h2>
                <p>
                  {price(service.priceMinor!, service.currency, locale)} ·{" "}
                  {service.durationMinutes} {en ? "min" : "分鐘"}
                </p>
                <p>
                  {service.locationLabel} · {service.timezone}
                </p>
                <p>{service.cancellationPolicy}</p>
                <p>
                  {en ? "Cancellation notice (minutes)" : "取消需提前（分鐘）"}
                  ：{service.cancellationNoticeMinutes}
                </p>
                <TimePicker
                  key={service.id}
                  locale={locale}
                  timezone={service.timezone}
                  date={date || today(service.timezone)}
                  onDate={setDate}
                  selected={selected}
                  onValidityChange={setSlotValid}
                  onSelect={(v) => {
                    setSelected(v);
                    setConfirmed(false);
                  }}
                  endpoint={(d) =>
                    `/business/services/${service.id}/availability?offeringId=${service.offeringId}&date=${d}`
                  }
                />
              </div>
              <div className="panel">
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={(e) => setConfirmed(e.target.checked)}
                    required
                  />
                  {en
                    ? "I have agreed this service, price, time and cancellation policy with the client and am recording it on their behalf."
                    : "我已與客戶確認這項服務、價格、時間及取消政策，並代為記錄。"}
                </label>
                <button
                  aria-busy={Boolean(busy)}
                  className="button primary"
                  disabled={
                    busy ||
                    !slotValid ||
                    selected === null ||
                    !chosen ||
                    !confirmed
                  }
                >
                  {busy
                    ? en
                      ? "Saving…"
                      : "儲存中…"
                    : en
                      ? "Record booking"
                      : "建立手動預約"}
                </button>
              </div>
            </>
          )}
        </form>
      )}
      <ErrorNotice message={error} />
    </section>
  );
}
export function MyProvidersPage({ locale }: { locale: Locale }) {
  const en = locale === "en",
    [items, setItems] = useState<MyProvider[] | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    void api<MyProvider[]>("/my-providers")
      .then((v) => {
        if (active) setItems(v);
      })
      .catch((e) => {
        if (active) setError(errorText(e, locale));
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  return (
    <section className="workspace page-width">
      <p className="eyebrow">YOUR KOVEYA</p>
      <h1>{en ? "Your providers" : "曾預約的服務者"}</h1>
      <Link className="text-link" to="/app">
        {en ? "My workspace" : "我的工作台"} →
      </Link>
      <p>
        {en
          ? "Public, active providers from your own bookings."
          : "顯示你曾預約且目前仍公開營運的供給方。"}
      </p>
      <ErrorNotice message={error} />
      {error && (
        <button
          className="button secondary"
          onClick={() => setAttempt((a) => a + 1)}
        >
          {en ? "Retry" : "重新載入"}
        </button>
      )}
      {!items && !error ? (
        <p role="status">{en ? "Loading…" : "載入中…"}</p>
      ) : items?.length === 0 ? (
        <div className="empty-state">
          <p>{en ? "No providers yet." : "目前還沒有服務者紀錄。"}</p>
        </div>
      ) : (
        <div className="managed-services">
          {items?.map((p) => (
            <article className="panel managed-service" key={p.slug}>
              <div>
                <h2>{p.publicName}</h2>
                <p>
                  {p.locationLabel} · {p.timezone}
                </p>
                <p>
                  {en ? "Your bookings" : "你的預約"}：{p.bookingCount}
                </p>
              </div>
              <Link className="button secondary" to={`/p/${p.slug}`}>
                {en ? "View services" : "查看服務"} →
              </Link>
            </article>
          ))}
        </div>
      )}
      {items && items.length >= 100 && (
        <p>
          {en
            ? "Showing the latest 100 providers."
            : "目前顯示最近 100 位服務者。"}
        </p>
      )}
    </section>
  );
}
