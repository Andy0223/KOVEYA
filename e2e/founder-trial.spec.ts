import { expect, test } from "@playwright/test";
import { actor, fixture, signIn, write } from "./helpers/booking-fixture";

test("owner sees self-request guidance and a separate customer completes a free request lifecycle", async ({
  page,
  playwright,
}) => {
  const owner = await actor(playwright);
  try {
    const f = await fixture(owner, "REQUEST", "FREE");
    await page.context().addCookies((await owner.storageState()).cookies);
    const url = `/p/${f.slug}/book/${f.input.serviceId}?date=${f.date}`;
    await page.goto(url);
    await expect(
      page.getByText("這是你自己的服務", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: /09:15/ }).click();
    await page.getByRole("checkbox").check();
    await expect(
      page.getByRole("button", { name: "送出預約申請", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("link", { name: "手動新增預約" }),
    ).toHaveAttribute("href", "/business/bookings/new");
    expect((await write(owner, "/booking-requests", f.input)).status()).toBe(
      409,
    );

    await page.context().clearCookies();
    await signIn(page.request);
    await page.goto(url);
    await expect(
      page.getByText("這是你自己的服務", { exact: false }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: /09:15/ }).click();
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "送出預約申請", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "預約申請詳情" }),
    ).toBeVisible();
    const requestId = page.url().split("/").at(-1)!;
    expect(
      (
        await write(owner, `/booking-requests/${requestId}/accept`, {
          expectedVersion: 1,
          acceptTerms: true,
        })
      ).status(),
    ).toBe(200);
    await page.reload();
    await page.getByRole("link", { name: "查看已確認預約" }).click();
    await expect(page.getByRole("heading", { name: "預約詳情" })).toBeVisible();
    const bookingId = page.url().split("/").at(-1)!;
    await expect(
      page.getByText("此服務免費，無須付款。", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("依約定方式直接向供給方付款", { exact: true }),
    ).toHaveCount(0);
    expect(
      (
        await write(owner, `/bookings/${bookingId}/reschedule-requests`, {
          expectedVersion: 1,
          startsAt: f.slots.at(-1),
        })
      ).status(),
    ).toBe(200);
    await page.reload();
    await page.getByRole("button", { name: "接受新時間" }).click();
    await expect(page.getByText("改期完成", { exact: true })).toBeVisible();
    await expect(
      page.getByText("此服務免費，無須付款。", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel("取消原因", { exact: true })
      .fill("Fictional two-account lifecycle complete");
    await page.getByRole("button", { name: "確認取消預約" }).click();
    await expect(page.getByText("已取消", { exact: true })).toBeVisible();
    const slots = (
      await (
        await owner.get(
          `/api/v1/services/${f.input.serviceId}/availability?offeringId=${f.input.offeringId}&date=${f.date}`,
        )
      ).json()
    ).data.slots;
    expect(slots).toContain(f.input.startsAt);
    expect(slots).toContain(f.slots.at(-1));
  } finally {
    await owner.dispose();
  }
});
