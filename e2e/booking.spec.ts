import { expect, test } from "@playwright/test";
import { signIn, actor, write, fixture } from "./helpers/booking-fixture";

test("100 competing D1 submissions create only one effective booking and cancellation releases it", async ({
  playwright,
}) => {
  test.setTimeout(60000);
  const owner = await actor(playwright),
    a = await actor(playwright),
    b = await actor(playwright);
  try {
    const f = await fixture(owner);
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        write(i % 2 ? a : b, "/bookings", f.input),
      ),
    );
    expect(results.filter((r) => r.status() === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status() === 409)).toHaveLength(99);
    const winner = (await results.find((r) => r.status() === 200)!.json()).data
      .id;
    const bookings = (
      await (await owner.get("/api/v1/bookings?scope=business")).json()
    ).data;
    expect(bookings).toHaveLength(1);
    expect(bookings[0].id).toBe(winner);
    const available = (
      await (
        await owner.get(
          `/api/v1/services/${f.input.serviceId}/availability?offeringId=${f.input.offeringId}&date=${f.date}`,
        )
      ).json()
    ).data;
    expect(available.slots).not.toContain(f.input.startsAt);
    const cancelKey = crypto.randomUUID();
    const cancellations = await Promise.all(
      Array.from({ length: 4 }, () =>
        write(
          owner,
          `/bookings/${winner}/cancel`,
          { expectedVersion: 1, reason: "Test complete" },
          cancelKey,
        ),
      ),
    );
    expect(cancellations.map((r) => r.status())).toEqual(Array(4).fill(200));
    const released = (
      await (
        await owner.get(
          `/api/v1/services/${f.input.serviceId}/availability?offeringId=${f.input.offeringId}&date=${f.date}`,
        )
      ).json()
    ).data;
    expect(released.slots).toContain(f.input.startsAt);
    const repeatedKey = crypto.randomUUID();
    const repeats = await Promise.all(
      Array.from({ length: 8 }, () =>
        write(a, "/bookings", f.input, repeatedKey),
      ),
    );
    expect(repeats.map((r) => r.status())).toEqual(Array(8).fill(200));
    const ids = await Promise.all(
      repeats.map(async (r) => (await r.json()).data.id),
    );
    expect(new Set(ids).size).toBe(1);
    expect(
      (
        await write(
          a,
          "/bookings",
          { ...f.input, startsAt: f.slots.at(-1) },
          repeatedKey,
        )
      ).status(),
    ).toBe(409);
  } finally {
    await Promise.all([owner.dispose(), a.dispose(), b.dispose()]);
  }
});

test("booking UI, counterpart reschedule consent, immutable terms and cancellation", async ({
  page,
  playwright,
}, testInfo) => {
  const owner = await actor(playwright);
  try {
    const f = await fixture(owner);
    await signIn(page.request);
    await page.goto(`/p/${f.slug}/book/${f.input.serviceId}?date=${f.date}`);
    await expect(
      page.getByRole("heading", { name: "選擇時間", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: /09:15/ }).click();
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "確認預約", exact: true }).click();
    await expect(page.getByRole("heading", { name: "預約詳情" })).toBeVisible();
    const id = page.url().split("/").at(-1)!;
    await page.screenshot({
      path: `test-results/booking-${testInfo.project.name}.png`,
      fullPage: true,
    });
    const old = (await (await owner.get(`/api/v1/bookings/${id}`)).json()).data;
    const proposed = await write(owner, `/bookings/${id}/reschedule-requests`, {
      expectedVersion: 1,
      startsAt: f.slots.at(-1),
    });
    expect(proposed.status()).toBe(200);
    expect(
      (await (await owner.get(`/api/v1/bookings/${id}`)).json()).data.startsAt,
    ).toBe(old.startsAt);
    await page.reload();
    await page.getByRole("button", { name: "接受新時間" }).click();
    await expect(page.getByText("改期完成", { exact: true })).toBeVisible();
    const updated = (await (await owner.get(`/api/v1/bookings/${id}`)).json())
      .data;
    expect(updated.startsAt).toBe(f.slots.at(-1));
    expect(updated.terms).toEqual(old.terms);
    await page.getByLabel("取消原因").fill("Changed plans");
    await page.getByRole("button", { name: "確認取消預約" }).click();
    await expect(page.getByText("已取消", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 320, height: 740 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.goto("/app/bookings");
    await expect(
      page.getByRole("heading", { name: "Booking coaching" }),
    ).toBeVisible();
  } finally {
    await owner.dispose();
  }
});

test("schedule UI saves closed exceptions and booking choice survives sign-in", async ({
  page,
  playwright,
}, testInfo) => {
  const owner = await actor(playwright);
  try {
    const f = await fixture(owner);
    await page.context().addCookies((await owner.storageState()).cookies);
    await page.goto("/business/availability");
    await expect(
      page.getByRole("heading", { name: "每週可用時間" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "新增日期例外" }).click();
    await page.getByLabel("例外日期").fill(f.date);
    await page.getByRole("button", { name: "儲存可用時間" }).click();
    await expect(
      page.getByText("可用時間已儲存。", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/availability-${testInfo.project.name}.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 320, height: 740 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.context().clearCookies();
    const nextDate = new Date(Date.parse(f.date) + 86_400_000)
      .toISOString()
      .slice(0, 10);
    await page.goto(`/p/${f.slug}/book/${f.input.serviceId}?date=${nextDate}`);
    await page.getByRole("button", { name: /09:15/ }).click();
    const chosenUrl = new URL(page.url());
    await page.getByRole("link", { name: "登入後確認預約" }).click();
    await page
      .getByLabel("Email", { exact: true })
      .fill(`${crypto.randomUUID()}@example.test`);
    await page.getByRole("button", { name: "寄送登入連結" }).click();
    await page.getByRole("link", { name: "開啟本機驗證連結" }).click();
    await page.getByRole("button", { name: "確認登入" }).click();
    await expect(page).toHaveURL(chosenUrl.href);
    await expect(page.getByRole("button", { name: /09:15/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  } finally {
    await owner.dispose();
  }
});
