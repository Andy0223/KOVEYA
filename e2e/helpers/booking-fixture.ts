import { expect } from "@playwright/test";
import type { APIRequestContext, PlaywrightWorkerArgs } from "@playwright/test";
export const base = "http://127.0.0.1:4173";
export async function signIn(request: APIRequestContext) {
  expect(
    (await (await request.get("/api/v1/auth/config")).json()).data.delivery,
  ).toBe("local");
  // Simulate a distinct client IP per browser; auth throttling tests keep their own shared IP.
  const clientIp = `198.18.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
  const response = await request.post("/api/v1/auth/email/start", {
    headers: { Origin: base, "CF-Connecting-IP": clientIp },
    data: { email: `${crypto.randomUUID()}@example.test` },
  });
  expect(response.status()).toBe(200);
  const token = new URLSearchParams(
    new URL((await response.json()).data.localPreviewUrl).hash.slice(1),
  ).get("token");
  expect(
    (
      await request.post("/api/v1/auth/email/verify", {
        headers: { Origin: base, "CF-Connecting-IP": clientIp },
        data: { token },
      })
    ).status(),
  ).toBe(200);
}
export async function actor(playwright: PlaywrightWorkerArgs["playwright"]) {
  const r = await playwright.request.newContext({ baseURL: base });
  await signIn(r);
  return r;
}
export async function write(
  r: APIRequestContext,
  path: string,
  data: unknown,
  key = crypto.randomUUID(),
) {
  return r.post(`/api/v1${path}`, {
    data,
    headers: { Origin: base, "Idempotency-Key": key },
  });
}
export async function fixture(
  owner: APIRequestContext,
  mode: "INSTANT" | "REQUEST" = "INSTANT",
) {
  const slug = `booking-${crypto.randomUUID()}`;
  expect(
    (
      await write(owner, "/organizations", {
        publicName: "Booking Studio",
        slug,
        bio: "Scheduling test",
        locationLabel: "Taipei",
        timezone: "Asia/Taipei",
        published: true,
      })
    ).status(),
  ).toBe(200);
  const schedule = (
    await (await owner.get("/api/v1/business/availability")).json()
  ).data;
  const rules = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    start: 540,
    end: 1080,
  }));
  expect(
    (
      await owner.put("/api/v1/business/availability", {
        headers: { Origin: base },
        data: {
          expectedRevision: schedule.revision,
          timezone: schedule.timezone,
          rules,
          exceptions: [],
        },
      })
    ).status(),
  ).toBe(200);
  const response = await write(owner, "/services", {
    name: "Booking coaching",
    description: "Book a private session",
    mode,
    delivery: "ONLINE",
    locationLabel: "Online meeting",
    timezone: "Asia/Taipei",
    durationMinutes: 60,
    pricingType: "FIXED",
    priceMinor: 150000,
    currency: "TWD",
    cancellationNoticeMinutes: 1440,
    cancellationPolicy: "Cancel at least 24 hours before the session.",
    minNoticeMinutes: 1440,
    maxAdvanceDays: 60,
    bufferBeforeMinutes: 15,
    bufferAfterMinutes: 15,
  });
  expect(response.status()).toBe(200);
  const created = (await response.json()).data;
  expect(
    (
      await write(owner, `/services/${created.id}/publish`, {
        expectedRevision: 1,
      })
    ).status(),
  ).toBe(200);
  const date = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const availability = (
    await (
      await owner.get(
        `/api/v1/services/${created.id}/availability?offeringId=${created.offeringId}&date=${date}`,
      )
    ).json()
  ).data;
  expect(availability.slots.length).toBeGreaterThan(2);
  return {
    slug,
    date,
    slots: availability.slots as number[],
    input: {
      serviceId: created.id,
      offeringId: created.offeringId,
      startsAt: availability.slots[0] as number,
      expectedServiceRevision: 2,
      acceptTerms: true,
    },
  };
}
