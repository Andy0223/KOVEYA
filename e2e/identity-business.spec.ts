import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";

const base = "http://127.0.0.1:4173";
test.beforeEach(async ({ request }) => {
  const config = await request.get("/api/v1/auth/config");
  expect(
    (await config.json()).data.delivery,
    "E2E must not use real email delivery",
  ).toBe("local");
});
const unique = () => crypto.randomUUID().replaceAll("-", "");
const post = (request: APIRequestContext, path: string, data: unknown) =>
  request.post(path, { data, headers: { Origin: base } });
async function start(
  request: APIRequestContext,
  email = `${unique()}@example.test`,
  returnTo = "/app",
) {
  const response = await post(request, "/api/v1/auth/email/start", {
    email,
    returnTo,
    locale: "zh-TW",
  });
  expect(response.status(), await response.text()).toBe(200);
  const data = (await response.json()).data;
  expect(data.localPreviewUrl).toContain("/auth/verify#token=");
  return new URLSearchParams(new URL(data.localPreviewUrl).hash.slice(1)).get(
    "token",
  )!;
}
async function signIn(request: APIRequestContext, email?: string) {
  const token = await start(request, email);
  expect(
    (await post(request, "/api/v1/auth/email/verify", { token })).status(),
  ).toBe(200);
  return token;
}
const profile = (slug = `studio-${unique()}`) => ({
  publicName: "Test Studio",
  slug,
  bio: "A test business",
  locationLabel: "Taipei",
  timezone: "Asia/Taipei",
  published: true,
});
const service = {
  name: "Test coaching",
  description: "A real draft record",
  mode: "INSTANT",
  delivery: "ONLINE",
  locationLabel: "Online",
  timezone: "Asia/Taipei",
  durationMinutes: 60,
  pricingType: "FIXED",
  priceMinor: 150000,
  currency: "TWD",
  cancellationNoticeMinutes: 1440,
  cancellationPolicy: "At least 24 hours notice.",
  minNoticeMinutes: 1440,
  maxAdvanceDays: 60,
  bufferBeforeMinutes: 15,
  bufferAfterMinutes: 15,
};

test("one-time login, account preferences, privacy requests and logout", async ({
  request,
}) => {
  expect((await request.get("/api/v1/me")).status()).toBe(401);
  const token = await signIn(request);
  const me = (await (await request.get("/api/v1/me")).json()).data;
  expect(me.user.id).toBeTruthy();
  expect(me.business).toBeNull();
  const cookies = (await request.storageState()).cookies;
  expect(cookies.find((c) => c.name === "koveya_session")?.httpOnly).toBe(true);
  expect(
    (await post(request, "/api/v1/auth/email/verify", { token })).status(),
  ).toBe(400);
  expect(
    (
      await request.patch("/api/v1/me", {
        headers: { Origin: base },
        data: {
          name: "Updated client",
          locale: "en",
          timezone: "Asia/Makassar",
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (await (await request.get("/api/v1/me")).json()).data.user.timezone,
  ).toBe("Asia/Makassar");
  const first = await post(request, "/api/v1/privacy-requests", {
    type: "EXPORT",
  });
  const second = await post(request, "/api/v1/privacy-requests", {
    type: "EXPORT",
  });
  expect((await first.json()).data.id).toBe((await second.json()).data.id);
  const sessionCookie = cookies
    .filter((c) => c.name === "koveya_session")
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  expect((await post(request, "/api/v1/auth/logout", {})).status()).toBe(200);
  expect(
    (
      await request.get("/api/v1/me", { headers: { Cookie: sessionCookie } })
    ).status(),
  ).toBe(401);
});

test("concurrent verification consumes a link once", async ({ request }) => {
  const token = await start(request);
  const loginCookie = (await request.storageState()).cookies
    .filter((c) => c.name === "koveya_login")
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");
  const results = await Promise.all(
    Array.from({ length: 6 }, () =>
      request.post("/api/v1/auth/email/verify", {
        data: { token },
        headers: { Origin: base, Cookie: loginCookie },
      }),
    ),
  );
  expect(results.filter((r) => r.status() === 200)).toHaveLength(1);
  expect(results.filter((r) => r.status() === 400)).toHaveLength(5);
});

test("verification is bound to the requesting browser and throttles repeated email sends", async ({
  request,
  playwright,
}) => {
  const outsider = await playwright.request.newContext({ baseURL: base });
  const token = await start(request);
  expect(
    (await post(outsider, "/api/v1/auth/email/verify", { token })).status(),
  ).toBe(400);
  expect(
    (await post(request, "/api/v1/auth/email/verify", { token })).status(),
  ).toBe(200);
  const email = `${unique()}@example.test`;
  for (let i = 0; i < 3; i++)
    expect(
      (await post(request, "/api/v1/auth/email/start", { email })).status(),
    ).toBe(200);
  const limited = await post(request, "/api/v1/auth/email/start", { email });
  expect(limited.status()).toBe(429);
  expect(Number(limited.headers()["retry-after"])).toBeGreaterThan(0);
  await outsider.dispose();
});

test("business draft, publish, tenant isolation and stale edit protection", async ({
  request,
  playwright,
}) => {
  await signIn(request);
  const business = profile();
  expect(
    (await post(request, "/api/v1/organizations", business)).status(),
  ).toBe(200);
  const create = await post(request, "/api/v1/services", service);
  expect(create.status(), await create.text()).toBe(200);
  const id = (await create.json()).data.id;
  const publicUrl = `/api/v1/providers/${business.slug}`;
  expect(
    (await (await request.get(publicUrl)).json()).data.services,
  ).toHaveLength(0);
  expect(
    (
      await post(request, `/api/v1/services/${id}/publish`, {
        expectedRevision: 1,
      })
    ).status(),
  ).toBe(200);
  expect(
    (await (await request.get(publicUrl)).json()).data.services,
  ).toHaveLength(1);
  const stale = await request.patch(`/api/v1/services/${id}`, {
    headers: { Origin: base },
    data: { ...service, priceMinor: 999, expectedRevision: 1 },
  });
  expect(stale.status()).toBe(409);
  expect(
    (await (await request.get(publicUrl)).json()).data.services[0].offerings[0]
      .priceMinor,
  ).toBe(150000);
  const outsider = await playwright.request.newContext({ baseURL: base });
  await signIn(outsider);
  await post(outsider, "/api/v1/organizations", profile());
  expect(
    (
      await outsider.patch(`/api/v1/services/${id}`, {
        headers: { Origin: base },
        data: { ...service, expectedRevision: 2 },
      })
    ).status(),
  ).toBe(404);
  expect(
    (
      await post(outsider, `/api/v1/services/${id}/unpublish`, {
        expectedRevision: 2,
      })
    ).status(),
  ).toBe(404);
  const variants = [
    { ...service, name: "Edit A", priceMinor: 10000, expectedRevision: 2 },
    { ...service, name: "Edit B", priceMinor: 20000, expectedRevision: 2 },
  ];
  const edits = await Promise.all(
    variants.map((data) =>
      request.patch(`/api/v1/services/${id}`, {
        headers: { Origin: base },
        data,
      }),
    ),
  );
  expect(edits.filter((r) => r.status() === 200)).toHaveLength(1);
  expect(edits.filter((r) => r.status() === 409)).toHaveLength(1);
  const winner = variants[edits.findIndex((r) => r.status() === 200)];
  const published = (await (await request.get(publicUrl)).json()).data
    .services[0];
  expect(published.name).toBe(winner.name);
  expect(published.offerings[0].priceMinor).toBe(winner.priceMinor);
  expect(
    (
      await post(request, `/api/v1/services/${id}/unpublish`, {
        expectedRevision: 3,
      })
    ).status(),
  ).toBe(200);
  expect(
    (await (await request.get(publicUrl)).json()).data.services,
  ).toHaveLength(0);
  await outsider.dispose();
});

test("revoke all sessions signs out a second browser for the same verified email", async ({
  request,
  playwright,
}) => {
  const email = `${unique()}@example.test`,
    other = await playwright.request.newContext({ baseURL: base });
  await signIn(request, email);
  await signIn(other, email);
  const one = (await (await request.get("/api/v1/me")).json()).data.user.id;
  const two = (await (await other.get("/api/v1/me")).json()).data.user.id;
  expect(one).toBe(two);
  expect(
    (await post(request, "/api/v1/auth/sessions/revoke-all", {})).status(),
  ).toBe(200);
  expect((await other.get("/api/v1/me")).status()).toBe(401);
  await other.dispose();
});

test("a duplicate public slug rolls back business provisioning", async ({
  request,
  playwright,
}) => {
  const other = await playwright.request.newContext({ baseURL: base });
  await signIn(request);
  await signIn(other);
  const shared = profile();
  expect((await post(request, "/api/v1/organizations", shared)).status()).toBe(
    200,
  );
  expect((await post(other, "/api/v1/organizations", shared)).status()).toBe(
    409,
  );
  expect(
    (await (await other.get("/api/v1/business/profile")).json()).data,
  ).toBeNull();
  expect((await post(other, "/api/v1/organizations", profile())).status()).toBe(
    200,
  );
  await other.dispose();
});

test("browser completes login, business creation, service publish and mode switch", async ({
  page,
}) => {
  const slug = `browser-${unique()}`;
  await page.goto("/sign-in?returnTo=%2Fbusiness");
  await page
    .getByLabel("Email", { exact: true })
    .fill(`${unique()}@example.test`);
  await page.getByRole("button", { name: "寄送登入連結", exact: true }).click();
  await page
    .getByRole("link", { name: "開啟本機驗證連結", exact: false })
    .click();
  await page.getByRole("button", { name: "確認登入", exact: true }).click();
  await expect(page).toHaveURL(/\/business$/);
  await page
    .getByLabel("品牌／公開名稱", { exact: true })
    .fill("Browser Studio");
  await page.getByLabel("公開網址代稱", { exact: true }).fill(slug);
  await page.getByRole("button", { name: "建立品牌頁", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Browser Studio", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "建立服務", exact: false }).click();
  await page.getByLabel("服務名稱", { exact: true }).fill("Browser coaching");
  await page.getByLabel("服務地點說明", { exact: true }).fill("Taipei");
  await page.getByRole("button", { name: "儲存草稿", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Browser coaching", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "發布", exact: true }).click();
  await expect(page.getByText("已發布", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "查看公開頁面", exact: false }).click();
  await expect(
    page.getByRole("heading", { name: "Browser coaching", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "主要導覽", exact: true })
    .getByRole("link", { name: "個人服務", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "歡迎回來",
  );
  await page
    .getByRole("link", { name: "切換供給方工作台", exact: false })
    .click();
  await expect(
    page.getByRole("heading", { name: "Browser Studio", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
