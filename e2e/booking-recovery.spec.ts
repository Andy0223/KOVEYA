import { expect, test } from "@playwright/test";
import { actor, fixture, signIn } from "./helpers/booking-fixture";

test("a saved selection remains disabled until its current availability response arrives", async ({
  page,
  playwright,
}) => {
  const owner = await actor(playwright);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    const f = await fixture(owner, "REQUEST");
    await signIn(page.request);
    await page.route("**/api/v1/services/*/availability?*", async (route) => {
      await gate;
      await route.continue();
    });
    await page.goto(
      `/p/${f.slug}/book/${f.input.serviceId}?date=${f.date}&start=${f.input.startsAt}`,
    );
    await expect(
      page.getByText("正在查詢可用時間…", { exact: true }),
    ).toBeVisible();
    await page.getByRole("checkbox").check();
    const submit = page.getByRole("button", {
      name: "送出預約申請",
      exact: true,
    });
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAttribute("aria-busy", "false");
    release();
    await expect(page.getByRole("button", { name: /09:15/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(submit).toBeEnabled();
  } finally {
    release();
    await owner.dispose();
  }
});

test("unavailable date explains disabled submission without a wait cursor", async ({
  page,
  playwright,
}, info) => {
  const owner = await actor(playwright);
  try {
    const f = await fixture(owner, "REQUEST");
    await signIn(page.request);
    await page.route("**/api/v1/services/*/availability?*", (route) =>
      route.fulfill({ json: { data: { slots: [] } } }),
    );
    await page.goto(`/p/${f.slug}/book/${f.input.serviceId}?date=${f.date}`);
    await expect(page.getByText(/這一天沒有可用時段/)).toBeVisible();
    await page.getByRole("checkbox").check();
    const submit = page.getByRole("button", {
      name: "送出預約申請",
      exact: true,
    });
    await expect(submit).toBeDisabled();
    await expect(submit).toHaveAttribute("aria-busy", "false");
    await expect(submit).toHaveCSS("cursor", "not-allowed");
    await expect(
      page.getByText("請先選擇日期與一個可用時段，才能送出。"),
    ).toBeVisible();
    await page.setViewportSize({ width: 320, height: 740 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/booking-disabled-${info.project.name}.png`,
      fullPage: true,
    });
  } finally {
    await owner.dispose();
  }
});

test("a restored URL cannot submit before availability validation and recovers after a query failure", async ({
  page,
  playwright,
}) => {
  const owner = await actor(playwright);
  try {
    const f = await fixture(owner, "REQUEST");
    await signIn(page.request);
    let fail = true;
    await page.route("**/api/v1/services/*/availability?*", (route) =>
      fail
        ? route.fulfill({
            status: 503,
            json: { error: { code: "SERVICE_UNAVAILABLE" } },
          })
        : route.continue(),
    );
    await page.goto(
      `/p/${f.slug}/book/${f.input.serviceId}?date=${f.date}&start=${f.input.startsAt}`,
    );
    await expect(page.getByRole("alert")).toContainText("服務暫時無法使用");
    await page.getByRole("checkbox").check();
    const submit = page.getByRole("button", {
      name: "送出預約申請",
      exact: true,
    });
    await expect(submit).toBeDisabled();
    expect(new URL(page.url()).searchParams.has("start")).toBe(false);
    fail = false;
    await page.getByRole("button", { name: "重新查詢" }).click();
    await page.getByRole("button", { name: /09:15/ }).click();
    await page.getByRole("checkbox").check();
    await expect(submit).toBeEnabled();
    await page.getByLabel(/服務當地日期/).fill("");
    await expect(submit).toBeDisabled();
    await page.getByLabel(/服務當地日期/).fill(f.date);
    await page.getByRole("button", { name: /09:15/ }).click();
    await page.getByRole("checkbox").check();
    await submit.click();
    await expect(
      page.getByRole("heading", { name: "預約申請詳情" }),
    ).toBeVisible();
  } finally {
    await owner.dispose();
  }
});

test("only a pending submission has a wait cursor and a lost response can retry without duplicate requests", async ({
  page,
  playwright,
}) => {
  const owner = await actor(playwright);
  try {
    const f = await fixture(owner, "REQUEST");
    await signIn(page.request);
    await page.goto(`/p/${f.slug}/book/${f.input.serviceId}?date=${f.date}`);
    await page.getByRole("button", { name: /09:15/ }).click();
    await page.getByRole("checkbox").check();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let committed!: () => void;
    const saved = new Promise<void>((resolve) => {
      committed = resolve;
    });
    let once = true;
    const keys: string[] = [];
    await page.route("**/api/v1/booking-requests", async (route) => {
      keys.push(route.request().headers()["idempotency-key"]);
      if (!once) return route.continue();
      once = false;
      const response = await route.fetch();
      expect(response.status()).toBe(200);
      committed();
      await gate;
      await route.abort("failed");
    });
    await page
      .getByRole("button", { name: "送出預約申請", exact: true })
      .click();
    await saved;
    const pending = page.getByRole("button", { name: "確認中…", exact: true });
    await expect(pending).toBeDisabled();
    await expect(pending).toHaveAttribute("aria-busy", "true");
    await expect(pending).toHaveCSS("cursor", "wait");
    release();
    await expect(page.getByRole("alert")).toBeVisible();
    const retry = page.getByRole("button", {
      name: "送出預約申請",
      exact: true,
    });
    await expect(retry).toBeEnabled();
    await retry.click();
    await expect(
      page.getByRole("heading", { name: "預約申請詳情" }),
    ).toBeVisible();
    const requests = (
      await (await owner.get("/api/v1/booking-requests?scope=business")).json()
    ).data;
    expect(requests).toHaveLength(1);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  } finally {
    await owner.dispose();
  }
});

test("free service does not ask for payment and a stale URL selection is discarded", async ({
  page,
  playwright,
}) => {
  const owner = await actor(playwright);
  try {
    const f = await fixture(owner, "REQUEST");
    await signIn(page.request);
    await page.route(`**/api/v1/providers/${f.slug}`, async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      body.data.services[0].offerings[0].priceMinor = 0;
      body.data.services[0].offerings[0].pricingType = "FREE";
      await route.fulfill({ json: body });
    });
    await page.goto(
      `/p/${f.slug}/book/${f.input.serviceId}?date=${f.date}&start=1`,
    );
    await expect(page.getByText("此服務免費，無須付款。")).toBeVisible();
    await expect(
      page.getByText(/請依雙方約定方式直接向供給方付款/),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: /09:15/ })).toBeVisible();
    await expect
      .poll(() => new URL(page.url()).searchParams.has("start"))
      .toBe(false);
    await page.getByRole("checkbox").check();
    await expect(
      page.getByRole("button", { name: "送出預約申請", exact: true }),
    ).toBeDisabled();
    // Safe integers may still exceed JavaScript's valid Date range.
    await page.goto(
      `/p/${f.slug}/book/${f.input.serviceId}?date=${f.date}&start=9007199254740991`,
    );
    await expect(
      page.getByRole("heading", { name: "選擇時間", exact: true }),
    ).toBeVisible();
    await expect
      .poll(() => new URL(page.url()).searchParams.has("start"))
      .toBe(false);
  } finally {
    await owner.dispose();
  }
});
