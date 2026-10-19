import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { actor, fixture, write } from "./helpers/booking-fixture";

test("provider records a contact and booking, changes time, downloads updated ICS and keeps email identities separate", async ({
  page,
  playwright,
}, info) => {
  const owner = await actor(playwright),
    customer = await actor(playwright),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    const f = await fixture(owner),
      customerEmail = (await (await customer.get("/api/v1/me")).json()).data
        .user.email;
    await page.context().addCookies((await owner.storageState()).cookies);
    await page.goto("/business/clients/new");
    await page.getByLabel("客戶姓名", { exact: true }).fill("Legacy Alex");
    await page
      .getByLabel("聯絡 Email（選填）", { exact: true })
      .fill(customerEmail);
    await page
      .getByLabel("電話（選填）", { exact: true })
      .fill("+886 912 345 678");
    await page.getByRole("button", { name: "建立客戶", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Legacy Alex", exact: true }),
    ).toBeVisible();
    const clientId = page.url().split("/").at(-1)!;
    await page
      .getByLabel("客戶姓名", { exact: true })
      .fill("Legacy Alex Updated");
    await page.getByRole("button", { name: "儲存聯絡資料" }).click();
    await expect(
      page.getByText("客戶聯絡資料已儲存。", { exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "為此客戶新增預約" }).click();
    await page.getByLabel("選擇客戶", { exact: true }).selectOption(clientId);
    await page
      .getByLabel("選擇服務", { exact: true })
      .selectOption(f.input.serviceId);
    await page.getByLabel(/服務當地日期/).fill(f.date);
    await page.getByRole("button", { name: /09:15/ }).click();
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "建立手動預約", exact: true })
      .click();
    await expect(page.getByRole("heading", { name: "預約詳情" })).toBeVisible();
    const bookingId = page.url().split("/").at(-1)!;
    await expect(
      page.getByText("此預約由供給方", { exact: false }),
    ).toBeVisible();
    async function download() {
      const [file] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "匯出行事曆（.ics）" }).click(),
      ]);
      expect(file.suggestedFilename()).toBe("koveya-booking.ics");
      return readFile((await file.path())!, "utf8");
    }
    const first = await download(),
      uid = first.match(/^UID:(.*)$/m)![1]!.trim();
    expect(first).toContain("BEGIN:VCALENDAR\r\n");
    expect(first).toContain("SEQUENCE:0\r\n");
    expect(first).not.toContain(customerEmail);
    await page.getByLabel(/服務當地日期/).fill(f.date);
    await page.getByRole("button", { name: /16:45/ }).click();
    await page
      .getByLabel("改期原因", { exact: true })
      .fill("Client agreed by phone");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "確認記錄改期" }).click();
    await expect(page.getByText("改期完成", { exact: true })).toBeVisible();
    const moved = await download();
    expect(moved).toContain(`UID:${uid}\r\n`);
    expect(moved).toContain("SEQUENCE:1\r\n");
    expect(moved.match(/^DTSTART:.*$/m)![0]).not.toBe(
      first.match(/^DTSTART:.*$/m)![0],
    );
    await page.screenshot({
      path: `test-results/manual-booking-${info.project.name}.png`,
      fullPage: true,
    });
    await page
      .getByLabel("取消原因", { exact: true })
      .fill("Cancelled by phone");
    await page.getByRole("button", { name: "確認取消預約" }).click();
    await expect(page.getByText("已取消", { exact: true })).toBeVisible();
    const cancelled = await download();
    expect(cancelled).toContain("STATUS:CANCELLED\r\n");
    expect(cancelled).toContain("SEQUENCE:2\r\n");
    expect((await customer.get(`/api/v1/bookings/${bookingId}`)).status()).toBe(
      404,
    );
    expect(
      (
        await customer.get(`/api/v1/bookings/${bookingId}/calendar.ics`)
      ).status(),
    ).toBe(404);
    expect(
      (await (await customer.get("/api/v1/bookings")).json()).data,
    ).toHaveLength(0);
    await page.goto(`/business/clients/${clientId}`);
    await expect(
      page.getByRole("heading", { name: "Booking coaching", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: `test-results/client-${info.project.name}.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 320, height: 740 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    // Booking with a verified account creates a separate relationship, never an email-only merge.
    expect((await write(customer, "/bookings", f.input)).status()).toBe(200);
    const contacts = (await (await owner.get("/api/v1/clients")).json()).data
      .items;
    expect(contacts).toHaveLength(2);
    expect(
      contacts.find((c: { id: string }) => c.id === clientId).linkedAccount,
    ).toBe(false);
    await page.context().clearCookies();
    await page.context().addCookies((await customer.storageState()).cookies);
    await page.goto("/app/providers");
    await expect(
      page.getByRole("heading", { name: "Booking Studio", exact: true }),
    ).toBeVisible();
    await page.getByRole("link", { name: "查看服務" }).click();
    await expect(page).toHaveURL(new RegExp(`/p/${f.slug}$`));
    expect(errors).toEqual([]);
  } finally {
    await Promise.all([owner.dispose(), customer.dispose()]);
  }
});

test("100 manual and customer D1 bookings compete without crossing client ownership", async ({
  playwright,
}) => {
  test.setTimeout(60000);
  const owner = await actor(playwright),
    customer = await actor(playwright);
  try {
    const f = await fixture(owner),
      created = await write(owner, "/clients", {
        name: "Offline client",
        email: null,
        phone: null,
      });
    expect(created.status()).toBe(200);
    const clientId = (await created.json()).data.id;
    const { acceptTerms, ...fields } = f.input;
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        i % 2
          ? write(owner, "/business/bookings", {
              ...fields,
              clientId,
              confirmedWithClient: true,
            })
          : write(customer, "/bookings", f.input),
      ),
    );
    expect(results.filter((r) => r.status() === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status() === 409)).toHaveLength(99);
    const bookings = (
      await (await owner.get("/api/v1/bookings?scope=business")).json()
    ).data;
    expect(bookings).toHaveLength(1);
    const mine = (await (await customer.get("/api/v1/bookings")).json()).data;
    if (bookings[0].source === "PROVIDER_RECORDED")
      expect(mine).toHaveLength(0);
    else expect(mine).toHaveLength(1);
    const details = (
      await (await owner.get(`/api/v1/clients/${clientId}`)).json()
    ).data;
    expect(details.client.linkedAccount).toBe(false);
    expect(details.totalBookings).toBe(
      bookings[0].source === "PROVIDER_RECORDED" ? 1 : 0,
    );
  } finally {
    await Promise.all([owner.dispose(), customer.dispose()]);
  }
});
