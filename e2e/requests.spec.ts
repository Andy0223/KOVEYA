import { expect, test } from "@playwright/test";
import { base, actor, fixture, signIn, write } from "./helpers/booking-fixture";

test("request UI requires customer consent to a counter-proposal and delivers private in-app notifications", async ({
  page,
  playwright,
}, info) => {
  const owner = await actor(playwright),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    const f = await fixture(owner, "REQUEST");
    await signIn(page.request);
    await page.goto(`/p/${f.slug}/book/${f.input.serviceId}?date=${f.date}`);
    await expect(
      page.getByText("這是預約申請", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: /09:15/ }).click();
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "送出預約申請", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "預約申請詳情" }),
    ).toBeVisible();
    const id = page.url().split("/").at(-1)!;
    expect(
      (await (await owner.get("/api/v1/bookings?scope=business")).json()).data,
    ).toHaveLength(0);
    expect(
      (
        await write(owner, `/booking-requests/${id}/counter-proposals`, {
          expectedVersion: 1,
          startsAt: f.slots.at(-1),
        })
      ).status(),
    ).toBe(200);
    await page.reload();
    await expect(
      page.getByText("待需求方確認替代時間", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/request-${info.project.name}.png`,
      fullPage: true,
    });
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "接受並確認預約" }).click();
    await expect(
      page.getByRole("link", { name: "查看已確認預約" }),
    ).toBeVisible();
    const request = (
      await (await owner.get(`/api/v1/booking-requests/${id}`)).json()
    ).data;
    const booking = (
      await (await owner.get(`/api/v1/bookings/${request.bookingId}`)).json()
    ).data;
    expect(booking.startsAt).toBe(f.slots.at(-1));
    expect(booking.terms.priceMinor).toBe(150000);
    // Bounded delivery may have earlier events from other tests; poll until this request is delivered.
    await expect
      .poll(async () => {
        const notifications = (
          await (await page.request.get("/api/v1/notifications")).json()
        ).data;
        return notifications.items.some(
          (n: { entityId: string; eventType: string }) =>
            n.entityId === id && n.eventType === "request.accepted",
        );
      })
      .toBe(true);
    await page.goto("/app/notifications");
    await expect(
      page.getByRole("heading", { name: "預約申請已接受", exact: true }),
    ).toBeVisible();
    const card = page
      .locator("article")
      .filter({
        has: page.getByRole("heading", { name: "預約申請已接受", exact: true }),
      });
    await card.getByRole("button", { name: "標記已讀" }).click();
    await expect(card.getByRole("button", { name: "標記已讀" })).toHaveCount(0);
    await page.screenshot({
      path: `test-results/notifications-${info.project.name}.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 320, height: 740 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    await owner.dispose();
  }
});

test("100 D1 request acceptances and instant bookings compete for the same shared resource", async ({
  playwright,
}) => {
  test.setTimeout(60000);
  const owner = await actor(playwright),
    client = await actor(playwright),
    other = await actor(playwright);
  try {
    const f = await fixture(owner, "REQUEST"),
      response = await write(client, "/booking-requests", f.input);
    expect(response.status()).toBe(200);
    const id = (await response.json()).data.id;
    const managed = (
      await (await owner.get("/api/v1/business/services")).json()
    ).data[0];
    const {
      id: serviceId,
      revision,
      status,
      offeringId,
      policyVersion,
      ...fields
    } = managed;
    expect(
      (
        await owner.patch(`/api/v1/services/${serviceId}`, {
          headers: { Origin: base },
          data: { ...fields, mode: "INSTANT", expectedRevision: revision },
        })
      ).status(),
    ).toBe(200);
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        i % 2
          ? write(owner, `/booking-requests/${id}/accept`, {
              expectedVersion: 1,
              acceptTerms: true,
            })
          : write(other, "/bookings", {
              ...f.input,
              expectedServiceRevision: 3,
            }),
      ),
    );
    expect(results.filter((r) => r.status() === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status() === 409)).toHaveLength(99);
    const bookings = (
      await (await owner.get("/api/v1/bookings?scope=business")).json()
    ).data;
    expect(bookings).toHaveLength(1);
    const request = (
      await (await client.get(`/api/v1/booking-requests/${id}`)).json()
    ).data;
    if (request.status === "ACCEPTED")
      expect(request.bookingId).toBe(bookings[0].id);
    else {
      expect(request.status).toBe("SUBMITTED");
      expect(request.bookingId).toBeNull();
    }
    // Concurrent processors must not duplicate the same event for a recipient.
    for (let i = 0; i < 4; i++)
      await Promise.all([
        owner.get("/api/v1/notifications"),
        client.get("/api/v1/notifications"),
      ]);
    const notifications = (
      await (await client.get("/api/v1/notifications")).json()
    ).data.items;
    expect(
      notifications.filter(
        (n: { entityId: string; eventType: string }) =>
          n.entityId === id && n.eventType === "request.submitted",
      ),
    ).toHaveLength(1);
    const stranger = (
      await (await other.get("/api/v1/booking-requests")).json()
    ).data;
    expect(stranger).toHaveLength(0);
  } finally {
    await Promise.all([owner.dispose(), client.dispose(), other.dispose()]);
  }
});
