import { describe, expect, it, vi, afterEach } from "vitest";
import { app } from "../worker";
import { hashToken, randomToken } from "../worker/modules/identity/crypto";
import { deliverLoginEmail } from "../worker/modules/identity/email";
import {
  emailStartInput,
  profileInput,
  safeReturnTo,
  serviceInput,
} from "../worker/validation";
import { parsePrice } from "../src/shared/account";

afterEach(() => vi.unstubAllGlobals());
describe("Identity boundary rules", () => {
  it("uses independent 256-bit secrets and one-way hashes", async () => {
    const first = randomToken(),
      second = randomToken();
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toBe(second);
    expect(await hashToken(first)).not.toBe(first);
    expect(await hashToken(first)).toBe(await hashToken(first));
  });
  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/app/../../evil",
    "/app\n",
    "/auth/verify",
    "javascript:alert(1)",
  ])("rejects open redirect %s", (value) =>
    expect(safeReturnTo(value)).toBe("/app"),
  );
  it("keeps the local booking intent after sign-in", () =>
    expect(safeReturnTo("/p/coach?service=a&time=2026-12-01")).toBe(
      "/p/coach?service=a&time=2026-12-01",
    ));
  it("normalizes only verified email identity input and rejects extra identity claims", () => {
    expect(emailStartInput.parse({ email: "Person@Example.com" }).email).toBe(
      "person@example.com",
    );
    expect(
      emailStartInput.safeParse({
        email: "person@example.com",
        userId: "another-user",
      }).success,
    ).toBe(false);
  });
  it("never enables local verification on a remote host, even if the flag is set", async () => {
    const response = await app.request(
      "https://koveya.example/api/v1/auth/config",
      {},
      { LOCAL_EMAIL_PREVIEW: "true" },
    );
    expect(
      ((await response.json()) as { data: { delivery: string } }).data.delivery,
    ).toBe("unavailable");
  });
  it("rejects cross-origin and missing-origin writes before any database access", async () => {
    for (const origin of ["https://evil.example", ""]) {
      const response = await app.request(
        "https://koveya.example/api/v1/auth/logout",
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: origin },
          body: "{}",
        },
        { APP_ORIGIN: "https://koveya.example" },
      );
      expect(response.status).toBe(403);
    }
  });
  it("rejects oversized payloads before parsing", async () => {
    const response = await app.request(
      "https://koveya.example/api/v1/auth/email/start",
      {
        method: "POST",
        headers: {
          Origin: "https://koveya.example",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email: "a".repeat(20_000) }),
      },
      { APP_ORIGIN: "https://koveya.example" },
    );
    expect(response.status).toBe(413);
  });
  it("rejects an invalid or reserved business slug", () => {
    const input = {
      publicName: "Studio",
      slug: "demo-coach",
      timezone: "Asia/Taipei",
    };
    expect(profileInput.safeParse(input).success).toBe(false);
    expect(
      profileInput.safeParse({
        ...input,
        slug: "studio-abc",
        timezone: "Not/A_Timezone",
      }).success,
    ).toBe(false);
  });
});

describe("Email adapter", () => {
  it("uses the verified recipient and provider idempotency without exposing credentials in an error", async () => {
    const sender = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", sender);
    await deliverLoginEmail(
      "test-key",
      "KOVEYA <test@example.com>",
      "client@example.com",
      "https://koveya.example/auth/verify#token=test",
      "en",
      "delivery-1",
    );
    const request = sender.mock.calls[0][1];
    expect(request.headers["Idempotency-Key"]).toBe("login/delivery-1");
    expect(JSON.parse(request.body).to).toEqual(["client@example.com"]);
    sender.mockResolvedValue(
      new Response("sensitive-provider-details", { status: 500 }),
    );
    await expect(
      deliverLoginEmail(
        "test-key",
        "sender",
        "client@example.com",
        "url",
        "en",
        "delivery-2",
      ),
    ).rejects.toThrow("EMAIL_UNAVAILABLE");
  });
});

describe("Pricing and service validation", () => {
  it.each([
    ["1500", "TWD", 150000],
    ["1500.10", "TWD", 150010],
    ["1200", "JPY", 1200],
    ["1.5", "JPY", null],
    ["1e4", "USD", null],
    ["0", "TWD", null],
    ["1.234", "USD", null],
  ] as const)(
    "parses %s %s without floating point multiplication",
    (value, currency, expected) =>
      expect(parsePrice(value, currency)).toBe(expected),
  );
  it("refuses unsupported currencies and zero-valued quote requests", () => {
    const input = {
      name: "Service",
      description: "",
      mode: "REQUEST",
      delivery: "ONLINE",
      locationLabel: "Online",
      timezone: "Asia/Taipei",
      durationMinutes: 60,
      pricingType: "QUOTE",
      priceMinor: null,
      currency: "TWD",
      cancellationNoticeMinutes: 1440,
      cancellationPolicy: "Policy",
      minNoticeMinutes: 0,
      maxAdvanceDays: 60,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    };
    expect(serviceInput.safeParse(input).success).toBe(true);
    for (const bad of [
      { currency: "BAD" },
      { priceMinor: 0 },
      { mode: "INSTANT" },
      { durationMinutes: 46 },
      { timezone: "invalid" },
      { orgId: "foreign-org" },
    ])
      expect(serviceInput.safeParse({ ...input, ...bad }).success).toBe(false);
  });
});
