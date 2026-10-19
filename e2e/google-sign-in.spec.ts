import { test, expect } from "@playwright/test";

test("Google sign-in UI preserves booking intent, handles failures and offers explicit linking", async ({
  page,
}) => {
  // UI adapter contract only. Real RS256 verification is covered with signed JWTs in Vitest;
  // this does not claim a live Google account signed in.
  const returnTo = "/p/demo-coach?service=test&time=chosen";
  await page.route("**/api/v1/auth/config", (route) =>
    route.fulfill({
      json: { data: { delivery: "local", googleClientId: "test-client" } },
    }),
  );
  await page.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `window.google={accounts:{id:{initialize:function(options){this.options=options},renderButton:function(el,options){var self=this;var b=document.createElement('button');b.style.width=options.width+'px';b.textContent='Google test adapter';b.onclick=function(){self.options.callback({credential:'ui-test-only'})};el.appendChild(b)},cancel:function(){}}}};`,
    }),
  );
  let linked = false,
    attempts = 0;
  await page.route("**/api/v1/auth/google/start", async (route) => {
    const input = route.request().postDataJSON();
    expect(input.returnTo).toBe(returnTo);
    linked = input.link;
    await route.fulfill({ json: { data: { nonce: "a".repeat(64) } } });
  });
  await page.route("**/api/v1/auth/google/verify", async (route) => {
    attempts++;
    await route.fulfill({
      status: 409,
      json: { error: { code: "GOOGLE_LINK_REQUIRED" } },
    });
  });
  await page.goto("/sign-in?returnTo=" + encodeURIComponent(returnTo));
  await page.getByRole("button", { name: "Google test adapter" }).click();
  await expect(page.getByRole("alert")).toContainText("請先使用 Email 登入");
  expect(attempts).toBe(1);
  expect(linked).toBe(false);
  await page.getByRole("button", { name: "重新載入 Google 登入" }).click();
  await expect(
    page.getByRole("button", { name: "Google test adapter" }),
  ).toHaveCount(1);
  await page.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        data: {
          user: {
            id: "existing",
            name: "Owner",
            email: "owner@gmail.com",
            locale: "zh-TW",
            timezone: "Asia/Taipei",
          },
          business: null,
        },
      },
    }),
  );
  await page.setViewportSize({ width: 320, height: 800 });
  await page.reload();
  await expect(
    page.getByText("將 Google 連結到目前帳號", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Google test adapter" }),
  ).toBeVisible();
  expect(linked).toBe(true);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.screenshot({
    path: `test-results/google-link-${test.info().project.name}.png`,
    fullPage: true,
  });
});

test("a blocked Google script shows recovery while Email login remains available", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/config", (route) =>
    route.fulfill({
      json: { data: { delivery: "local", googleClientId: "test-client" } },
    }),
  );
  await page.route("https://accounts.google.com/gsi/client", (route) =>
    route.abort(),
  );
  await page.goto("/sign-in");
  await expect(
    page.getByRole("button", { name: "重新載入 Google 登入" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "寄送登入連結" }),
  ).toBeEnabled();
});
