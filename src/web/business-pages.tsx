import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  BusinessProfile,
  Locale,
  ManagedService,
} from "../shared/account";
import { currencyDigits, parsePrice } from "../shared/account";
import { api, errorText, useAccount } from "./account";

export function BusinessNav({ locale }: { locale: Locale }) {
  const en = locale === "en";
  return (
    <nav
      className="workspace-nav"
      aria-label={en ? "Business navigation" : "商業工作台導覽"}
    >
      <Link to="/business">{en ? "Services" : "服務管理"}</Link>
      <Link to="/business/availability">
        {en ? "Availability" : "可用時間"}
      </Link>
      <Link to="/business/bookings">{en ? "Bookings" : "預約管理"}</Link>
      <Link to="/business/profile">{en ? "Business profile" : "品牌資料"}</Link>
      <Link to="/app/profile">{en ? "Account" : "帳號設定"}</Link>
    </nav>
  );
}

export function BusinessHome({ locale }: { locale: Locale }) {
  const { account } = useAccount(),
    en = locale === "en";
  const [services, setServices] = useState<ManagedService[]>([]),
    [loading, setLoading] = useState(true);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState<string | null>(null);
  const load = async () => {
    try {
      setServices(await api("/business/services"));
      setLoading(false);
    } catch (e) {
      setError(errorText(e, locale));
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [account?.business?.orgId]);
  if (!account?.business) return <BusinessProfilePage locale={locale} />;
  async function toggle(service: ManagedService) {
    setBusy(service.id);
    setError("");
    try {
      await api(
        `/services/${service.id}/${service.status === "PUBLISHED" ? "unpublish" : "publish"}`,
        "POST",
        { expectedRevision: service.revision },
      );
      await load();
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setBusy(null);
    }
  }
  const statuses = en
    ? {
        DRAFT: "Draft",
        PUBLISHED: "Published",
        UNPUBLISHED: "Unpublished",
        ARCHIVED: "Archived",
      }
    : {
        DRAFT: "草稿",
        PUBLISHED: "已發布",
        UNPUBLISHED: "已下架",
        ARCHIVED: "已封存",
      };
  return (
    <section className="workspace page-width">
      <p className="eyebrow">KOVEYA BUSINESS</p>
      <h1>{account.business.publicName}</h1>
      <BusinessNav locale={locale} />
      <div className="workspace-toolbar">
        <div>
          <h2>{en ? "Your services" : "你的服務"}</h2>
          <p>
            {en
              ? "Create a draft, review the details, then publish."
              : "先建立草稿，確認服務資訊後再發布。"}
          </p>
        </div>
        <Link className="button primary" to="/business/services/new">
          {en ? "Create service" : "建立服務"} +
        </Link>
      </div>
      <p className="notice">
        {en
          ? "Set shared working hours before sharing your link. Instant booking, cancellation and reschedule proposals are available; request-to-book is coming next."
          : "分享連結前，請先設定可用時間。目前支援直接預約、取消與改期提案；申請式預約待接續完成。"}
      </p>
      <Link className="text-link" to={`/p/${account.business.slug}`}>
        {en ? "View public page" : "查看公開頁面"} ↗
      </Link>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">{en ? "Loading services…" : "正在載入服務…"}</p>
      ) : services.length === 0 ? (
        <div className="empty-state">
          <span aria-hidden>↗</span>
          <h3>
            {en ? "Start with your first service." : "從你的第一個服務開始。"}
          </h3>
          <p>
            {en
              ? "Give your expertise a name, a price, and a place to connect."
              : "為你的專業取個名字，設定價格與提供方式。"}
          </p>
        </div>
      ) : (
        <div className="managed-services">
          {services.map((service) => (
            <article className="managed-service panel" key={service.id}>
              <div>
                <span
                  className={`status-badge ${service.status.toLowerCase()}`}
                >
                  {statuses[service.status]}
                </span>
                <h3>{service.name}</h3>
                <p>
                  {service.durationMinutes} {en ? "min" : "分鐘"} ·{" "}
                  {service.currency} · {service.timezone}
                </p>
              </div>
              <div className="button-row">
                <Link
                  className="button secondary"
                  to={`/business/services/${service.id}`}
                >
                  {en ? "Edit" : "編輯"}
                </Link>
                <button
                  className="button secondary"
                  disabled={busy === service.id}
                  onClick={() => void toggle(service)}
                >
                  {service.status === "PUBLISHED"
                    ? en
                      ? "Unpublish"
                      : "下架"
                    : en
                      ? "Publish"
                      : "發布"}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function BusinessProfilePage({ locale }: { locale: Locale }) {
  const en = locale === "en",
    { account, refresh } = useAccount(),
    navigate = useNavigate();
  const [profile, setProfile] = useState<BusinessProfile | null>(null),
    [loading, setLoading] = useState(Boolean(account?.business));
  const [name, setName] = useState(account?.user.name ?? ""),
    [slug, setSlug] = useState(""),
    [bio, setBio] = useState(""),
    [location, setLocation] = useState("");
  const [zone, setZone] = useState(account?.user.timezone ?? "Asia/Taipei"),
    [published, setPublished] = useState(true);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (!account?.business) {
      setLoading(false);
      return;
    }
    void api<BusinessProfile>("/business/profile")
      .then((value) => {
        setProfile(value);
        setName(value.publicName);
        setSlug(value.slug);
        setBio(value.bio);
        setLocation(value.locationLabel);
        setZone(value.timezone);
        setPublished(value.published);
        setLoading(false);
      })
      .catch((e) => {
        setError(errorText(e, locale));
        setLoading(false);
      });
  }, [account?.business?.orgId]);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(
        profile ? `/organizations/${profile.id}` : "/organizations",
        profile ? "PATCH" : "POST",
        {
          publicName: name,
          slug,
          bio,
          locationLabel: location,
          timezone: zone,
          published,
        },
      );
      await refresh();
      if (!profile) navigate("/business");
      else setNotice(en ? "Business profile saved." : "品牌資料已儲存。");
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="workspace page-width settings-page">
      <p className="eyebrow">KOVEYA BUSINESS</p>
      <h1>
        {account?.business
          ? en
            ? "Your business profile"
            : "你的品牌資料"
          : en
            ? "A place for your expertise."
            : "為你的專業，建立一個空間。"}
      </h1>
      {account?.business && <BusinessNav locale={locale} />}
      {loading ? (
        <p role="status">{en ? "Loading profile…" : "正在載入品牌…"}</p>
      ) : (
        <form className="stack-form panel" onSubmit={save}>
          <label htmlFor="public-name">
            {en ? "Public name" : "品牌／公開名稱"}
          </label>
          <input
            id="public-name"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label htmlFor="slug">{en ? "Public address" : "公開網址代稱"}</label>
          <div className="slug-input">
            <span>/p/</span>
            <input
              id="slug"
              required
              minLength={3}
              maxLength={60}
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              disabled={Boolean(profile)}
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              placeholder="your-business"
            />
          </div>
          <p className="field-help">
            {en
              ? "Use lowercase letters, numbers, and hyphens. This cannot be changed after creation."
              : "使用英文小寫、數字與連字號；建立後不直接變更，避免分享連結失效。"}
          </p>
          <label htmlFor="bio">{en ? "About your business" : "品牌介紹"}</label>
          <textarea
            id="bio"
            maxLength={2000}
            rows={4}
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
          <label htmlFor="business-location">
            {en ? "Public location label" : "公開地區名稱"}
          </label>
          <input
            id="business-location"
            maxLength={200}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={en ? "Taipei · Taiwan" : "台北 · Taiwan"}
          />
          <label htmlFor="business-timezone">
            {en ? "Business timezone" : "業務時區"}
          </label>
          <input
            id="business-timezone"
            required
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            placeholder="Asia/Taipei"
          />
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
            />
            {en ? "Make this business profile public" : "公開品牌頁面"}
          </label>
          <p className="field-help">
            {en
              ? "When public, the name, introduction, location label, and published services can be viewed by anyone."
              : "公開後，所有人都能查看品牌名稱、介紹、地區與已發布服務。"}
          </p>
          <button
            className="button primary"
            disabled={busy || Boolean(account?.business && !profile)}
          >
            {busy
              ? en
                ? "Saving…"
                : "儲存中…"
              : profile
                ? en
                  ? "Save profile"
                  : "儲存品牌資料"
                : en
                  ? "Create business profile"
                  : "建立品牌頁"}
          </button>
        </form>
      )}
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

type ServiceForm = Omit<ManagedService, "id" | "revision" | "status">;
export function ServiceEditor({ locale }: { locale: Locale }) {
  const en = locale === "en",
    { id } = useParams(),
    { account } = useAccount(),
    navigate = useNavigate();
  const [existing, setExisting] = useState<ManagedService | null>(null),
    [loading, setLoading] = useState(Boolean(id));
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [price, setPrice] = useState("1500");
  const [form, setForm] = useState<ServiceForm>({
    name: "",
    description: "",
    mode: "INSTANT",
    delivery: "IN_PERSON",
    locationLabel: "",
    timezone: account?.user.timezone ?? "Asia/Taipei",
    durationMinutes: 60,
    pricingType: "FIXED",
    priceMinor: 150000,
    currency: "TWD",
    cancellationNoticeMinutes: 1440,
    cancellationPolicy: en
      ? "Cancel at least 24 hours before the service."
      : "請至少在服務開始 24 小時前取消。",
    minNoticeMinutes: 1440,
    maxAdvanceDays: 60,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
  });
  function field<K extends keyof ServiceForm>(key: K, value: ServiceForm[K]) {
    setForm((previous) => ({ ...previous, [key]: value }));
  }
  useEffect(() => {
    if (!id) return;
    void api<ManagedService[]>("/business/services")
      .then((services) => {
        const found = services.find((service) => service.id === id);
        if (!found) throw new Error("missing");
        setExisting(found);
        setForm(found);
        setPrice(
          found.priceMinor === null
            ? ""
            : (found.priceMinor / 10 ** currencyDigits[found.currency]).toFixed(
                currencyDigits[found.currency],
              ),
        );
        setLoading(false);
      })
      .catch((e) => {
        setError(errorText(e, locale));
        setLoading(false);
      });
  }, [id]);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const amount =
      form.pricingType === "FREE"
        ? 0
        : form.pricingType === "QUOTE"
          ? null
          : parsePrice(price, form.currency);
    if (form.pricingType === "FIXED" && amount === null) {
      setError(
        en
          ? "Enter a valid price in the selected currency."
          : "請依所選幣別輸入有效金額。",
      );
      setBusy(false);
      return;
    }
    // Pick editable fields explicitly; API responses also contain ids/status/revision.
    const value = {
      name: form.name,
      description: form.description,
      mode: form.mode,
      delivery: form.delivery,
      locationLabel: form.locationLabel,
      timezone: form.timezone,
      durationMinutes: form.durationMinutes,
      pricingType: form.pricingType,
      priceMinor: amount,
      currency: form.currency,
      cancellationNoticeMinutes: form.cancellationNoticeMinutes,
      cancellationPolicy: form.cancellationPolicy,
      minNoticeMinutes: form.minNoticeMinutes,
      maxAdvanceDays: form.maxAdvanceDays,
      bufferBeforeMinutes: form.bufferBeforeMinutes,
      bufferAfterMinutes: form.bufferAfterMinutes,
      ...(existing ? { expectedRevision: existing.revision } : {}),
    };
    try {
      await api(
        existing ? `/services/${existing.id}` : "/services",
        existing ? "PATCH" : "POST",
        value,
      );
      navigate("/business");
    } catch (e) {
      setError(errorText(e, locale));
    } finally {
      setBusy(false);
    }
  }
  if (!account?.business) return <BusinessProfilePage locale={locale} />;
  return (
    <section className="workspace page-width service-editor">
      <p className="eyebrow">KOVEYA BUSINESS</p>
      <h1>
        {id
          ? en
            ? "Edit your service"
            : "編輯服務"
          : en
            ? "Create your first connection."
            : "建立一個新的連結。"}
      </h1>
      <BusinessNav locale={locale} />
      {loading ? (
        <p role="status">{en ? "Loading service…" : "正在載入服務…"}</p>
      ) : (
        <form className="stack-form" onSubmit={save}>
          <fieldset className="panel">
            <legend>{en ? "01 · Service details" : "01 · 服務內容"}</legend>
            <label htmlFor="service-name">
              {en ? "Service name" : "服務名稱"}
            </label>
            <input
              id="service-name"
              required
              maxLength={120}
              value={form.name}
              onChange={(e) => field("name", e.target.value)}
            />
            <label htmlFor="description">
              {en ? "Description" : "服務介紹"}
            </label>
            <textarea
              id="description"
              maxLength={4000}
              rows={4}
              value={form.description}
              onChange={(e) => field("description", e.target.value)}
            />
            <div className="form-grid">
              <div>
                <label htmlFor="delivery">{en ? "Delivery" : "提供方式"}</label>
                <select
                  id="delivery"
                  value={form.delivery}
                  onChange={(e) =>
                    field("delivery", e.target.value as ServiceForm["delivery"])
                  }
                >
                  <option value="IN_PERSON">
                    {en ? "In person" : "實體服務"}
                  </option>
                  <option value="ONLINE">{en ? "Online" : "線上服務"}</option>
                  <option value="AT_CLIENT">
                    {en ? "At client location" : "到府服務"}
                  </option>
                </select>
              </div>
              <div>
                <label htmlFor="service-location">
                  {en ? "Location label" : "服務地點說明"}
                </label>
                <input
                  id="service-location"
                  required
                  maxLength={200}
                  value={form.locationLabel}
                  onChange={(e) => field("locationLabel", e.target.value)}
                />
              </div>
            </div>
          </fieldset>
          <fieldset className="panel">
            <legend>{en ? "02 · Time & pricing" : "02 · 時間與價格"}</legend>
            <div className="form-grid">
              <div>
                <label htmlFor="duration">
                  {en ? "Duration (minutes)" : "服務時長（分鐘）"}
                </label>
                <input
                  id="duration"
                  type="number"
                  required
                  min={15}
                  max={720}
                  step={15}
                  value={form.durationMinutes}
                  onChange={(e) =>
                    field("durationMinutes", Number(e.target.value))
                  }
                />
              </div>
              <div>
                <label htmlFor="service-timezone">
                  {en ? "Service timezone" : "服務時區"}
                </label>
                <input
                  id="service-timezone"
                  required
                  value={form.timezone}
                  onChange={(e) => field("timezone", e.target.value)}
                />
              </div>
            </div>
            <label htmlFor="pricing">{en ? "Pricing" : "定價方式"}</label>
            <select
              id="pricing"
              value={form.pricingType}
              onChange={(e) =>
                setForm((previous) => ({
                  ...previous,
                  pricingType: e.target.value as ServiceForm["pricingType"],
                  ...(e.target.value === "QUOTE" ? { mode: "REQUEST" } : {}),
                }))
              }
            >
              <option value="FIXED">{en ? "Fixed price" : "固定價格"}</option>
              <option value="FREE">{en ? "Free" : "免費"}</option>
              <option value="QUOTE">
                {en ? "Price on request" : "待報價"}
              </option>
            </select>
            <div className="form-grid">
              <div>
                <label htmlFor="price">
                  {en ? "Price (currency units)" : "價格（原幣金額）"}
                </label>
                <input
                  id="price"
                  inputMode="decimal"
                  required={form.pricingType === "FIXED"}
                  disabled={form.pricingType !== "FIXED"}
                  value={
                    form.pricingType === "FREE"
                      ? "0"
                      : form.pricingType === "QUOTE"
                        ? ""
                        : price
                  }
                  onChange={(e) => setPrice(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="currency">{en ? "Currency" : "幣別"}</label>
                <select
                  id="currency"
                  value={form.currency}
                  onChange={(e) =>
                    field("currency", e.target.value as ServiceForm["currency"])
                  }
                >
                  {Object.keys(currencyDigits).map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
          </fieldset>
          <fieldset className="panel">
            <legend>{en ? "03 · Booking policies" : "03 · 預約規則"}</legend>
            <label htmlFor="mode">{en ? "Confirmation" : "確認方式"}</label>
            <select
              id="mode"
              value={form.mode}
              onChange={(e) =>
                field("mode", e.target.value as ServiceForm["mode"])
              }
            >
              <option value="INSTANT" disabled={form.pricingType === "QUOTE"}>
                {en ? "Instant booking" : "直接預約"}
              </option>
              <option value="REQUEST">
                {en ? "Request to book" : "需供給方確認"}
              </option>
            </select>
            {form.pricingType === "QUOTE" && (
              <p className="notice">
                {en
                  ? "A quote needs customer agreement. Booking submissions are not available yet."
                  : "待報價需取得需求方對價格的同意；目前尚未開放提交預約。"}
              </p>
            )}
            <div className="form-grid">
              {(["bufferBeforeMinutes", "bufferAfterMinutes"] as const).map(
                (key, i) => (
                  <div key={key}>
                    <label htmlFor={key}>
                      {i === 0
                        ? en
                          ? "Buffer before (min)"
                          : "服務前緩衝（分鐘）"
                        : en
                          ? "Buffer after (min)"
                          : "服務後緩衝（分鐘）"}
                    </label>
                    <input
                      id={key}
                      type="number"
                      min={0}
                      max={1440}
                      step={15}
                      required
                      value={form[key]}
                      onChange={(e) => field(key, Number(e.target.value))}
                    />
                  </div>
                ),
              )}
            </div>
            <div className="form-grid">
              <div>
                <label htmlFor="notice">
                  {en ? "Minimum notice (minutes)" : "至少提前預約（分鐘）"}
                </label>
                <input
                  id="notice"
                  type="number"
                  required
                  min={0}
                  max={43200}
                  value={form.minNoticeMinutes}
                  onChange={(e) =>
                    field("minNoticeMinutes", Number(e.target.value))
                  }
                />
              </div>
              <div>
                <label htmlFor="advance">
                  {en ? "Booking window (days)" : "開放預約範圍（天）"}
                </label>
                <input
                  id="advance"
                  type="number"
                  required
                  min={1}
                  max={365}
                  value={form.maxAdvanceDays}
                  onChange={(e) =>
                    field("maxAdvanceDays", Number(e.target.value))
                  }
                />
              </div>
            </div>
            <label htmlFor="cancel-notice">
              {en ? "Cancellation notice (minutes)" : "取消需提前（分鐘）"}
            </label>
            <input
              id="cancel-notice"
              type="number"
              required
              min={0}
              max={43200}
              value={form.cancellationNoticeMinutes}
              onChange={(e) =>
                field("cancellationNoticeMinutes", Number(e.target.value))
              }
            />
            <label htmlFor="cancel-policy">
              {en ? "Cancellation policy" : "取消政策說明"}
            </label>
            <textarea
              id="cancel-policy"
              required
              rows={3}
              maxLength={2000}
              value={form.cancellationPolicy}
              onChange={(e) => field("cancellationPolicy", e.target.value)}
            />
          </fieldset>
          <div className="form-actions">
            <button
              className="button primary"
              disabled={busy || Boolean(id && !existing)}
            >
              {busy
                ? en
                  ? "Saving…"
                  : "儲存中…"
                : existing
                  ? en
                    ? "Save changes"
                    : "儲存變更"
                  : en
                    ? "Save draft"
                    : "儲存草稿"}
            </button>
            <Link className="text-link" to="/business">
              {en ? "Back to services" : "返回服務管理"}
            </Link>
          </div>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function DemandHome({ locale }: { locale: Locale }) {
  const { account } = useAccount(),
    en = locale === "en";
  return (
    <section className="workspace page-width">
      <p className="eyebrow">YOUR KOVEYA</p>
      <h1>
        {en
          ? `Welcome, ${account?.user.name}.`
          : `${account?.user.name}，歡迎回來。`}
      </h1>
      <p className="intro">
        {en
          ? "One account for your services and your expertise."
          : "用同一個帳號，管理服務安排與自己的專業。"}
      </p>
      <div className="button-row">
        <Link className="button secondary" to="/app/profile">
          {en ? "Profile & account" : "個人資料與帳號"}
        </Link>
        <Link className="button primary" to="/business">
          {en ? "Switch to business" : "切換供給方工作台"} ↗
        </Link>
      </div>
      <Link className="button primary" to="/app/bookings">
        {en ? "My bookings" : "我的預約"} →
      </Link>
      <div className="empty-state">
        <span aria-hidden>◷</span>
        <h2>
          {en ? "Your next service starts here." : "期待你的下一次服務。"}
        </h2>
        <p>
          {en
            ? "Manage your confirmed bookings, cancellation and reschedule proposals in My bookings."
            : "在「我的預約」查看已確認安排，處理取消與改期提案。"}
        </p>
        <Link className="text-link" to="/p/demo-coach">
          {en ? "View a sample service page" : "查看示範服務頁"} →
        </Link>
      </div>
    </section>
  );
}
