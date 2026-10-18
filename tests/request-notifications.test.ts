import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import worker, { app } from "../worker";
import { hashToken } from "../worker/modules/identity/crypto";
import { testDatabase } from "./helpers/sqlite-d1";
import {
  dispatchNotifications,
  expireRequests,
  maintenance,
} from "../worker/modules/notifications/jobs";
let db: ReturnType<typeof testDatabase>;
const origin = "http://127.0.0.1:5173",
  start = Date.parse("2026-10-21T02:00:00Z");
const input = {
  serviceId: "service-demo-tennis",
  offeringId: "offering-demo-tennis",
  startsAt: start,
  expectedServiceRevision: 1,
  acceptTerms: true,
};
const cookies: Record<string, string> = {};
beforeEach(async () => {
  vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-10-19T00:00:00Z"));
  db = testDatabase();
  db.sqlite.exec(readFileSync("seeds/demo.sql", "utf8"));
  for (const user of ["owner", "client", "other"]) {
    const token = { owner: "a", client: "b", other: "c" }[user]!.repeat(64);
    cookies[user] = `koveya_session=${token}`;
    db.sqlite
      .prepare("INSERT INTO users (id,name,created_at) VALUES (?,?,1)")
      .run(user, user);
    db.sqlite
      .prepare("INSERT INTO identities VALUES (?,?,'email',?)")
      .run(user, user, `${user}@example.test`);
    db.sqlite
      .prepare("INSERT INTO sessions VALUES (?,?,?,NULL)")
      .run(await hashToken(token), user, Date.now() + 7 * 86_400_000);
  }
  db.sqlite.exec(
    "UPDATE organizations SET owner_user_id='owner' WHERE id='org-demo'; INSERT INTO organization_members VALUES ('org-demo','owner','OWNER'); UPDATE services SET mode='REQUEST' WHERE id='service-demo-tennis'",
  );
});
afterEach(() => {
  db.sqlite.close();
  vi.restoreAllMocks();
});
async function request(
  path: string,
  user = "client",
  method = "GET",
  value?: unknown,
  key = crypto.randomUUID(),
) {
  return app.request(
    origin + "/api/v1" + path,
    {
      method,
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: cookies[user]!,
        "Idempotency-Key": key,
      },
      ...(method !== "GET" ? { body: JSON.stringify(value ?? {}) } : {}),
    },
    { DB: db.binding, LOCAL_EMAIL_PREVIEW: "true" },
  );
}
async function create(value = input, key = crypto.randomUUID()) {
  const r = await request("/booking-requests", "client", "POST", value, key);
  expect(r.status).toBe(200);
  return ((await r.json()) as { data: { id: string } }).data.id;
}
function count(table: string) {
  return db.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n;
}
describe("Request-to-book lifecycle and in-app delivery", () => {
  it("submits without holding a slot, saves terms and replays one result", async () => {
    const key = crypto.randomUUID(),
      id = await create(input, key);
    expect(await create(input, key)).toBe(id);
    expect(count("booking_requests")).toBe(1);
    expect(count("bookings")).toBe(0);
    expect(count("booking_allocations")).toBe(0);
    const row = db.sqlite
      .prepare("SELECT terms_snapshot FROM booking_requests WHERE id=?")
      .get(id)!;
    expect(JSON.parse(row.terms_snapshot as string).priceMinor).toBe(150000);
    expect(
      (
        await request(
          "/booking-requests",
          "client",
          "POST",
          { ...input, startsAt: start + 900_000 },
          key,
        )
      ).status,
    ).toBe(409);
    expect((await request(`/booking-requests/${id}`, "other")).status).toBe(
      404,
    );
    expect(
      (
        await request(
          `/booking-requests/${id}/availability?date=2026-10-21`,
          "other",
        )
      ).status,
    ).toBe(404);
  });
  it("acceptance by owner creates one booking and uses the original agreed terms", async () => {
    const id = await create();
    expect(
      (
        await request(`/booking-requests/${id}/accept`, "client", "POST", {
          expectedVersion: 1,
          acceptTerms: true,
        })
      ).status,
    ).toBe(403);
    db.sqlite.exec(
      "UPDATE offerings SET price_minor=900000 WHERE id='offering-demo-tennis'; UPDATE services SET cancellation_policy='changed',revision=revision+1 WHERE id='service-demo-tennis'",
    );
    const key = crypto.randomUUID(),
      value = { expectedVersion: 1, acceptTerms: true };
    expect(
      (
        await request(
          `/booking-requests/${id}/accept`,
          "owner",
          "POST",
          value,
          key,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/booking-requests/${id}/accept`,
          "owner",
          "POST",
          value,
          key,
        )
      ).status,
    ).toBe(200);
    expect(count("bookings")).toBe(1);
    expect(count("booking_allocations")).toBe(4);
    const row = db.sqlite.prepare("SELECT terms_snapshot FROM bookings").get()!;
    expect(JSON.parse(row.terms_snapshot as string).priceMinor).toBe(150000);
    expect(
      JSON.parse(row.terms_snapshot as string).cancellationPolicy,
    ).not.toBe("changed");
  });
  it("counter-proposal must be explicitly accepted by the customer, with a matching version", async () => {
    const id = await create(),
      newTime = start + 3_600_000;
    expect(
      (
        await request(
          `/booking-requests/${id}/counter-proposals`,
          "client",
          "POST",
          { expectedVersion: 1, startsAt: newTime },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          `/booking-requests/${id}/counter-proposals`,
          "owner",
          "POST",
          { expectedVersion: 1, startsAt: newTime },
        )
      ).status,
    ).toBe(200);
    expect(count("bookings")).toBe(0);
    expect(
      (
        await request(`/booking-requests/${id}/accept`, "owner", "POST", {
          expectedVersion: 2,
          acceptTerms: true,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(`/booking-requests/${id}/accept`, "client", "POST", {
          expectedVersion: 1,
          acceptTerms: true,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(`/booking-requests/${id}/accept`, "client", "POST", {
          expectedVersion: 2,
          acceptTerms: false,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request(`/booking-requests/${id}/accept`, "client", "POST", {
          expectedVersion: 2,
          acceptTerms: true,
        })
      ).status,
    ).toBe(200);
    expect(
      db.sqlite.prepare("SELECT starts_at FROM bookings").get()?.starts_at,
    ).toBe(newTime);
    const detail = (
      (await (await request(`/booking-requests/${id}`)).json()) as {
        data: { originalStartsAt: number; startsAt: number };
      }
    ).data;
    expect(detail.originalStartsAt).toBe(start);
    expect(detail.startsAt).toBe(newTime);
  });
  it.each([
    ["reject", "owner", "REJECTED"],
    ["withdraw", "client", "WITHDRAWN"],
    ["decline", "client", "DECLINED"],
  ])(
    "%s records reason, closes once, and never creates allocations",
    async (action, user, status) => {
      const id = await create();
      let version = 1;
      if (action === "decline") {
        expect(
          (
            await request(
              `/booking-requests/${id}/counter-proposals`,
              "owner",
              "POST",
              { expectedVersion: 1, startsAt: start + 3_600_000 },
            )
          ).status,
        ).toBe(200);
        version = 2;
      }
      const value = { expectedVersion: version, reason: "Not suitable" },
        key = crypto.randomUUID();
      expect(
        (
          await request(
            `/booking-requests/${id}/${action}`,
            user,
            "POST",
            value,
            key,
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await request(
            `/booking-requests/${id}/${action}`,
            user,
            "POST",
            value,
            key,
          )
        ).status,
      ).toBe(200);
      expect(
        db.sqlite
          .prepare("SELECT status FROM booking_requests WHERE id=?")
          .get(id)?.status,
      ).toBe(status);
      expect(count("booking_allocations")).toBe(0);
      expect(
        (
          await request(`/booking-requests/${id}/accept`, "owner", "POST", {
            expectedVersion: version + 1,
            acceptTerms: true,
          })
        ).status,
      ).toBe(409);
    },
  );
  it("a competing instant booking prevents acceptance without falsely accepting the request", async () => {
    const id = await create();
    db.sqlite.exec(
      "UPDATE services SET mode='INSTANT' WHERE id='service-demo-online'",
    );
    const result = await request("/bookings", "other", "POST", {
      ...input,
      serviceId: "service-demo-online",
      offeringId: "offering-demo-online",
    });
    expect(result.status).toBe(200);
    expect(
      (
        await request(`/booking-requests/${id}/accept`, "owner", "POST", {
          expectedVersion: 1,
          acceptTerms: true,
        })
      ).status,
    ).toBe(409);
    expect(
      db.sqlite
        .prepare("SELECT status,booking_id FROM booking_requests WHERE id=?")
        .get(id),
    ).toMatchObject({ status: "SUBMITTED", booking_id: null });
    expect(count("bookings")).toBe(1);
  });
  it("a hidden service cannot be accepted and QUOTE cannot bypass price agreement", async () => {
    const id = await create();
    db.sqlite.exec(
      "UPDATE services SET status='UNPUBLISHED' WHERE id='service-demo-tennis'",
    );
    expect(
      (
        await request(`/booking-requests/${id}/accept`, "owner", "POST", {
          expectedVersion: 1,
          acceptTerms: true,
        })
      ).status,
    ).toBe(404);
    db.sqlite.exec(
      "UPDATE services SET status='PUBLISHED' WHERE id='service-demo-tennis';UPDATE offerings SET pricing_type='QUOTE',price_minor=NULL WHERE id='offering-demo-tennis'",
    );
    expect(
      (await request("/booking-requests", "client", "POST", input)).status,
    ).toBe(409);
  });
  it("rolls back submission or acceptance when event persistence fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const key = crypto.randomUUID();
    db.sqlite.exec(
      "CREATE TRIGGER fail_outbox BEFORE INSERT ON outbox_events BEGIN SELECT RAISE(ABORT,'injected'); END",
    );
    expect(
      (await request("/booking-requests", "client", "POST", input, key)).status,
    ).toBe(500);
    expect(count("booking_requests")).toBe(0);
    expect(count("client_relationships")).toBe(0);
    expect(count("idempotency_records")).toBe(0);
    db.sqlite.exec("DROP TRIGGER fail_outbox");
    const id = await create(input, key);
    db.sqlite.exec(
      "CREATE TRIGGER fail_booking_outbox BEFORE INSERT ON outbox_events WHEN NEW.event_type='booking.confirmed' BEGIN SELECT RAISE(ABORT,'injected'); END",
    );
    const acceptKey = crypto.randomUUID(),
      value = { expectedVersion: 1, acceptTerms: true };
    expect(
      (
        await request(
          `/booking-requests/${id}/accept`,
          "owner",
          "POST",
          value,
          acceptKey,
        )
      ).status,
    ).toBe(500);
    expect(count("bookings")).toBe(0);
    expect(count("booking_allocations")).toBe(0);
    expect(count("transaction_guards")).toBe(0);
    expect(
      db.sqlite.prepare("SELECT status FROM booking_requests").get()?.status,
    ).toBe("SUBMITTED");
    db.sqlite.exec("DROP TRIGGER fail_booking_outbox");
    expect(
      (
        await request(
          `/booking-requests/${id}/accept`,
          "owner",
          "POST",
          value,
          acceptKey,
        )
      ).status,
    ).toBe(200);
  });
  it("expires once with a system event and rejects acceptance at the exact deadline", async () => {
    const id = await create();
    db.sqlite
      .prepare("UPDATE booking_requests SET expires_at=? WHERE id=?")
      .run(Date.now(), id);
    expect(
      (
        await request(`/booking-requests/${id}/accept`, "owner", "POST", {
          expectedVersion: 1,
          acceptTerms: true,
        })
      ).status,
    ).toBe(409);
    await expireRequests(db.binding);
    await expireRequests(db.binding);
    expect(
      db.sqlite.prepare("SELECT status,version FROM booking_requests").get(),
    ).toMatchObject({ status: "EXPIRED", version: 2 });
    expect(count("request_events")).toBe(2);
    expect(
      db.sqlite
        .prepare(
          "SELECT actor_id FROM request_events WHERE event_type='request.expired'",
        )
        .get()?.actor_id,
    ).toBeNull();
  });
  it("delivers to authorized participants once and allows only the recipient to mark read", async () => {
    await create();
    await maintenance(db.binding);
    await maintenance(db.binding);
    expect(count("notifications")).toBe(2);
    const mine = (
      (await (await request("/notifications")).json()) as {
        data: { items: { id: string }[]; unread: number };
      }
    ).data;
    expect(mine.unread).toBe(1);
    const id = mine.items[0]!.id;
    expect(
      (
        await request(
          `/notifications/${encodeURIComponent(id)}/read`,
          "other",
          "POST",
          {},
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `/notifications/${encodeURIComponent(id)}/read`,
          "client",
          "POST",
          {},
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/notifications/${encodeURIComponent(id)}/read`,
          "client",
          "POST",
          {},
        )
      ).status,
    ).toBe(200);
    expect(
      (
        (await (await request("/notifications", "other")).json()) as {
          data: { items: unknown[] };
        }
      ).data.items,
    ).toEqual([]);
    expect(
      (
        (await (await request("/notifications")).json()) as {
          data: { unread: number };
        }
      ).data.unread,
    ).toBe(0);
  });
  it("notification failure retries without modifying the accepted booking", async () => {
    const id = await create();
    expect(
      (
        await request(`/booking-requests/${id}/accept`, "owner", "POST", {
          expectedVersion: 1,
          acceptTerms: true,
        })
      ).status,
    ).toBe(200);
    db.sqlite.exec(
      "CREATE TRIGGER reject_notification BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT,'injected'); END",
    );
    await dispatchNotifications(db.binding);
    expect(count("notifications")).toBe(0);
    expect(
      db.sqlite
        .prepare("SELECT attempts,last_error FROM outbox_events LIMIT 1")
        .get(),
    ).toMatchObject({ attempts: 1, last_error: "IN_APP_DELIVERY_FAILED" });
    expect(count("bookings")).toBe(1);
    db.sqlite.exec("DROP TRIGGER reject_notification");
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 31_000);
    await dispatchNotifications(db.binding);
    expect(count("notifications")).toBe(6);
    expect(
      db.sqlite
        .prepare("SELECT COUNT(*) AS n FROM outbox_events WHERE status='SENT'")
        .get()?.n,
    ).toBe(3);
  });
  it("scheduled maintenance expires a request and delivers its event", async () => {
    const id = await create();
    db.sqlite
      .prepare("UPDATE booking_requests SET expires_at=? WHERE id=?")
      .run(Date.now(), id);
    const work: Promise<unknown>[] = [];
    worker.scheduled({} as ScheduledController, { DB: db.binding }, {
      waitUntil: (promise: Promise<unknown>) => work.push(promise),
    } as unknown as ExecutionContext);
    expect(work).toHaveLength(1);
    await Promise.all(work);
    expect(
      db.sqlite
        .prepare("SELECT status FROM booking_requests WHERE id=?")
        .get(id)?.status,
    ).toBe("EXPIRED");
    expect(
      db.sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM notifications WHERE event_type='request.expired'",
        )
        .get()?.n,
    ).toBe(2);
  });
  it("expiry rolls back if its event cannot be persisted", async () => {
    const id = await create();
    db.sqlite
      .prepare("UPDATE booking_requests SET expires_at=? WHERE id=?")
      .run(Date.now(), id);
    db.sqlite.exec(
      "CREATE TRIGGER fail_expiry BEFORE INSERT ON outbox_events WHEN NEW.event_type='request.expired' BEGIN SELECT RAISE(ABORT,'injected'); END",
    );
    await expect(expireRequests(db.binding)).rejects.toThrow();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await maintenance(db.binding);
    expect(log).toHaveBeenCalled();
    expect(count("notifications")).toBe(2);

    expect(
      db.sqlite.prepare("SELECT status,version FROM booking_requests").get(),
    ).toMatchObject({ status: "SUBMITTED", version: 1 });
    expect(count("request_events")).toBe(1);
    db.sqlite.exec("DROP TRIGGER fail_expiry");
    await expireRequests(db.binding);
    expect(count("request_events")).toBe(2);
  });
  it("stops retrying after five delivery failures without repeating domain effects", async () => {
    await create();
    db.sqlite.exec(
      "CREATE TRIGGER fail_notifications BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT,'injected'); END",
    );
    for (let i = 0; i < 5; i++)
      await dispatchNotifications(db.binding, Date.now() + i * 3_600_000);
    const row = db.sqlite
      .prepare("SELECT status,attempts,last_error FROM outbox_events")
      .get();
    expect(row).toMatchObject({
      status: "FAILED",
      attempts: 5,
      last_error: "IN_APP_DELIVERY_FAILED",
    });
    await dispatchNotifications(db.binding, Date.now() + 86_400_000);
    expect(
      db.sqlite.prepare("SELECT attempts FROM outbox_events").get()?.attempts,
    ).toBe(5);
    expect(count("booking_requests")).toBe(1);
  });
  it("does not confirm a booking for a suspended requester", async () => {
    const id = await create();
    db.sqlite.exec("UPDATE users SET status='SUSPENDED' WHERE id='client'");
    expect(
      (
        await request(`/booking-requests/${id}/accept`, "owner", "POST", {
          expectedVersion: 1,
          acceptTerms: true,
        })
      ).status,
    ).toBe(409);
    expect(count("bookings")).toBe(0);
  });
});
