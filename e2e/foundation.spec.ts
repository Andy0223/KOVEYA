import { expect, test } from "@playwright/test";

test("home switches language and navigates to workspace introductions", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "你的專業",
  );
  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Your expertise",
  );
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "KOVEYA Business" })
    .click();
  await expect(
    page.getByText("Sign in with email", {
      exact: false,
    }),
  ).toBeVisible();
});

test("public provider reads D1 and shows service terms", async ({ page }) => {
  await page.goto("/p/demo-coach");
  await expect(
    page.getByRole("heading", { name: "KOVEYA Demo Coach" }),
  ).toBeVisible();
  await expect(page.getByText("1,500.00", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "查看服務內容" }).first().click();
  await expect(page.getByRole("heading", { name: "取消政策" })).toBeVisible();
  await expect(
    page.getByText("預約功能建置中", { exact: false }),
  ).toBeVisible();
});

test("missing provider and missing API have explicit outcomes", async ({
  page,
  request,
}) => {
  await page.goto("/p/does-not-exist");
  await expect(page.getByText("服務頁不存在或尚未公開。")).toBeVisible();
  const response = await request.get("/api/v1/missing");
  expect(response.status()).toBe(404);
  expect((await response.json()).error.code).toBe("NOT_FOUND");
});

test("320px core pages have no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  for (const path of ["/", "/business", "/app", "/p/demo-coach"]) {
    await page.goto(path);
    if (path.startsWith("/p/"))
      await expect(
        page.getByRole("heading", { name: "KOVEYA Demo Coach" }),
      ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
});

test("public API excludes drafts and private tenant fields", async ({
  request,
}) => {
  const response = await request.get("/api/v1/providers/demo-coach");
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.data.services).toHaveLength(2);
  expect(body.data.orgId).toBeUndefined();
  expect(body.data.id).toBeUndefined();
  expect(JSON.stringify(body.data)).not.toContain("service-demo-draft");
  expect(JSON.stringify(body.data)).not.toContain("org-demo");
});
