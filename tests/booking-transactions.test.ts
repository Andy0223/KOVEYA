import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../worker";
import { hashToken } from "../worker/modules/identity/crypto";
import { testDatabase } from "./helpers/sqlite-d1";
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
      .run(await hashToken(token), user, Date.now() + 86_400_000);
  }
  db.sqlite.exec(
    "UPDATE organizations SET owner_user_id='owner' WHERE id='org-demo'; INSERT INTO organization_members VALUES ('org-demo','owner','OWNER')",
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
  const r = await request("/bookings", "client", "POST", value, key);
  expect(r.status).toBe(200);
  return ((await r.json()) as { data: { id: string } }).data.id;
}
function count(table: string) {
  return db.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n;
}
describe("BKG / SCH booking transactions", () => {
  it("creates one booking, immutable terms, allocations, audit and outbox with replay", async () => {
    const key = crypto.randomUUID(),
      id = await create(input, key);
    await create(input, key);
    expect(count("bookings")).toBe(1);
    expect(count("booking_allocations")).toBe(4);
    expect(count("outbox_events")).toBe(1);
    expect(count("transaction_guards")).toBe(0);
    db.sqlite.exec(
      "UPDATE services SET cancellation_notice_minutes=0,cancellation_policy='changed',revision=revision+1; UPDATE offerings SET price_minor=999999 WHERE id='offering-demo-tennis'",
    );
    const r = await request(`/bookings/${id}`);
    const result = (await r.json()) as {
      data: { terms: { priceMinor: number; cancellationPolicy: string } };
    };
    expect(result.data.terms.priceMinor).toBe(150000);
    expect(result.data.terms.cancellationPolicy).not.toBe("changed");
    expect(
      (
        await request(
          "/bookings",
          "client",
          "POST",
          { ...input, startsAt: start + 900_000 },
          key,
        )
      ).status,
    ).toBe(409);
  });
  it("rejects stale terms, unpublished services, arbitrary times and cross-tenant reads", async () => {
    expect(
      (
        await request("/bookings", "client", "POST", {
          ...input,
          expectedServiceRevision: 99,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request("/bookings", "client", "POST", {
          ...input,
          startsAt: start + 1,
        })
      ).status,
    ).toBe(400);
    const id = await create();
    expect((await request(`/bookings/${id}`, "other")).status).toBe(404);
    expect(
      (
        await request(`/bookings/${id}/cancel`, "other", "POST", {
          expectedVersion: 1,
          reason: "cancel",
        })
      ).status,
    ).toBe(404);
    expect((await request(`/bookings/${id}`, "owner")).status).toBe(200);
    db.sqlite.exec("UPDATE services SET status='UNPUBLISHED'");
    expect((await request("/bookings", "other", "POST", input)).status).toBe(
      404,
    );
  });
  it("cancels once, releases slots, enforces the original cancellation deadline", async () => {
    const id = await create(),
      key = crypto.randomUUID();
    db.sqlite.exec("UPDATE services SET cancellation_notice_minutes=0");
    vi.spyOn(Date, "now").mockReturnValue(start - 60_000);
    // Restore session validity for the clock advance.
    db.sqlite.exec(`UPDATE sessions SET expires_at=${start + 86_400_000}`);
    expect(
      (
        await request(`/bookings/${id}/cancel`, "client", "POST", {
          expectedVersion: 1,
          reason: "late",
        })
      ).status,
    ).toBe(409);
    const value = { expectedVersion: 1, reason: "provider unavailable" };
    expect(
      (await request(`/bookings/${id}/cancel`, "owner", "POST", value, key))
        .status,
    ).toBe(200);
    expect(
      (await request(`/bookings/${id}/cancel`, "owner", "POST", value, key))
        .status,
    ).toBe(200);
    expect(count("booking_allocations")).toBe(0);
    expect(count("booking_events")).toBe(2);
    expect(
      (await request(`/bookings/${id}/cancel`, "owner", "POST", value)).status,
    ).toBe(409);
  });
  it("rolls every write back when outbox persistence fails, then safely retries", async () => {
    db.sqlite.exec(
      "CREATE TRIGGER fail_outbox BEFORE INSERT ON outbox_events BEGIN SELECT RAISE(ABORT,'injected failure'); END",
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const key = crypto.randomUUID();
    expect(
      (await request("/bookings", "client", "POST", input, key)).status,
    ).toBe(500);
    for (const table of [
      "bookings",
      "booking_allocations",
      "booking_events",
      "client_relationships",
      "idempotency_records",
      "transaction_guards",
    ])
      expect(count(table)).toBe(0);
    db.sqlite.exec("DROP TRIGGER fail_outbox");
    await create(input, key);
  });
  it("preserves original booking when a proposed reschedule loses the new slot", async () => {
    const id = await create(),
      newStart = start + 3_600_000;
    const proposalResponse = await request(
      `/bookings/${id}/reschedule-requests`,
      "owner",
      "POST",
      { expectedVersion: 1, startsAt: newStart },
    );
    expect(proposalResponse.status).toBe(200);
    const proposal = (
      (await proposalResponse.json()) as { data: { id: string } }
    ).data.id;
    expect(
      db.sqlite.prepare("SELECT starts_at FROM bookings WHERE id=?").get(id)
        ?.starts_at,
    ).toBe(start);
    await create({ ...input, startsAt: newStart });
    expect(
      (
        await request(
          `/reschedule-requests/${proposal}/accept`,
          "client",
          "POST",
          {},
        )
      ).status,
    ).toBe(409);
    expect(
      db.sqlite.prepare("SELECT starts_at FROM bookings WHERE id=?").get(id)
        ?.starts_at,
    ).toBe(start);
    expect(
      db.sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM booking_allocations WHERE booking_id=?",
        )
        .get(id)?.n,
    ).toBe(4);
  });
  it("only the counterpart may accept; terms stay unchanged after reschedule", async () => {
    const id = await create(),
      newStart = start + 3_600_000;
    const response = await request(
      `/bookings/${id}/reschedule-requests`,
      "owner",
      "POST",
      { expectedVersion: 1, startsAt: newStart },
    );
    const proposal = ((await response.json()) as { data: { id: string } }).data
      .id;
    expect(
      (
        await request(
          `/reschedule-requests/${proposal}/accept`,
          "owner",
          "POST",
          {},
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          `/reschedule-requests/${proposal}/accept`,
          "client",
          "POST",
          {},
        )
      ).status,
    ).toBe(200);
    const row = db.sqlite
      .prepare(
        "SELECT starts_at,version,terms_snapshot FROM bookings WHERE id=?",
      )
      .get(id)!;
    expect(row.starts_at).toBe(newStart);
    expect(row.version).toBe(2);
    expect(JSON.parse(row.terms_snapshot as string).priceMinor).toBe(150000);
  });
  it("rolls reschedule time and released allocations back when replacement allocation fails", async () => {
    const id = await create(),
      newStart = start + 3_600_000;
    const result = await request(
      `/bookings/${id}/reschedule-requests`,
      "owner",
      "POST",
      { expectedVersion: 1, startsAt: newStart },
    );
    const proposal = ((await result.json()) as { data: { id: string } }).data
      .id;
    db.sqlite.exec(
      `CREATE TRIGGER fail_replacement BEFORE INSERT ON booking_allocations WHEN NEW.slot_start_utc>=${newStart} BEGIN SELECT RAISE(ABORT,'injected replacement failure'); END`,
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const key = crypto.randomUUID();
    expect(
      (
        await request(
          `/reschedule-requests/${proposal}/accept`,
          "client",
          "POST",
          {},
          key,
        )
      ).status,
    ).toBe(500);
    expect(
      db.sqlite
        .prepare("SELECT starts_at,version FROM bookings WHERE id=?")
        .get(id),
    ).toMatchObject({ starts_at: start, version: 1 });
    expect(
      db.sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM booking_allocations WHERE booking_id=?",
        )
        .get(id)?.n,
    ).toBe(4);
    expect(
      db.sqlite
        .prepare("SELECT status FROM reschedule_requests WHERE id=?")
        .get(proposal)?.status,
    ).toBe("PENDING");
    db.sqlite.exec("DROP TRIGGER fail_replacement");
    expect(
      (
        await request(
          `/reschedule-requests/${proposal}/accept`,
          "client",
          "POST",
          {},
          key,
        )
      ).status,
    ).toBe(200);
  });
  it("blocks expired proposals without changing the original booking", async () => {
    const id = await create(),
      result = await request(
        `/bookings/${id}/reschedule-requests`,
        "owner",
        "POST",
        { expectedVersion: 1, startsAt: start + 3_600_000 },
      );
    const proposal = ((await result.json()) as { data: { id: string } }).data
      .id;
    db.sqlite.exec("UPDATE reschedule_requests SET expires_at=1");
    expect(
      (
        await request(
          `/reschedule-requests/${proposal}/accept`,
          "client",
          "POST",
          {},
        )
      ).status,
    ).toBe(409);
    expect(
      db.sqlite.prepare("SELECT starts_at FROM bookings WHERE id=?").get(id)
        ?.starts_at,
    ).toBe(start);
  });
  it("blocks a service revision race at the transaction boundary", async () => {
    const batch = db.binding.batch.bind(db.binding);
    vi.spyOn(db.binding, "batch").mockImplementation(async (statements) => {
      // Rate limiting uses a single statement; only intercept the domain batch.
      db.sqlite.exec(
        "UPDATE services SET revision=revision+1 WHERE id='service-demo-tennis'",
      );
      return batch(statements);
    });
    expect((await request("/bookings", "client", "POST", input)).status).toBe(
      409,
    );
    expect(count("bookings")).toBe(0);
    expect(count("client_relationships")).toBe(0);
    expect(count("idempotency_records")).toBe(0);
  });
  it("only the provider may complete a service, only after it ends, and only once", async () => {
    const id = await create();
    expect(
      (
        await request(`/bookings/${id}/complete`, "owner", "POST", {
          expectedVersion: 1,
        })
      ).status,
    ).toBe(409);
    expect(
      (
        await request(`/bookings/${id}/complete`, "client", "POST", {
          expectedVersion: 1,
        })
      ).status,
    ).toBe(403);
    vi.spyOn(Date, "now").mockReturnValue(start + 3_600_000);
    db.sqlite.exec(`UPDATE sessions SET expires_at=${start + 86_400_000}`);
    const key = crypto.randomUUID();
    expect(
      (
        await request(
          `/bookings/${id}/complete`,
          "owner",
          "POST",
          { expectedVersion: 1 },
          key,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          `/bookings/${id}/complete`,
          "owner",
          "POST",
          { expectedVersion: 1 },
          key,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(`/bookings/${id}/no-show`, "owner", "POST", {
          expectedVersion: 2,
        })
      ).status,
    ).toBe(409);
  });
  it("closed dates and stale scheduling edits are rejected atomically", async () => {
    const response = await request("/business/availability", "owner");
    const schedule = (
      (await response.json()) as { data: object & { revision: number } }
    ).data;
    const value = {
      ...schedule,
      expectedRevision: schedule.revision,
      exceptions: [{ date: "2026-10-21", intervals: [] }],
    };
    delete (value as Partial<typeof value>).revision;
    expect(
      (await request("/business/availability", "owner", "PUT", value)).status,
    ).toBe(200);
    expect(
      (await request("/business/availability", "owner", "PUT", value)).status,
    ).toBe(409);
    expect((await request("/bookings", "client", "POST", input)).status).toBe(
      409,
    );
    expect(count("bookings")).toBe(0);
  });
});
