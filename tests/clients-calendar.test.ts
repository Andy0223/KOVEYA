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
      .run(await hashToken(token), user, Date.now() + 7 * 86_400_000);
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
async function contact(
  value = {
    name: "Legacy client",
    email: "client@example.test",
    phone: "+886 912 345 678",
  },
  key = crypto.randomUUID(),
) {
  const response = await request("/clients", "owner", "POST", value, key);
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: { id: string } }).data.id;
}
const manual = (clientId: string) => ({
  ...input,
  clientId,
  confirmedWithClient: true,
});
function manualInput(clientId: string) {
  const { acceptTerms, ...value } = manual(clientId);
  return value;
}
async function manualBook(
  clientId: string,
  key = crypto.randomUUID(),
  startsAt = start,
) {
  const response = await request(
    "/business/bookings",
    "owner",
    "POST",
    { ...manualInput(clientId), startsAt },
    key,
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: { id: string } }).data.id;
}
async function otherBusiness() {
  expect(
    (
      await request("/organizations", "other", "POST", {
        publicName: "Other business",
        slug: "other-business",
        bio: "",
        locationLabel: "Taipei",
        timezone: "Asia/Taipei",
        published: true,
      })
    ).status,
  ).toBe(200);
}

describe("CRM, provider-recorded bookings and private calendar export", () => {
  it("creates one contact on retry and never links a matching email to an account", async () => {
    const key = crypto.randomUUID(),
      id = await contact(undefined, key);
    expect(await contact(undefined, key)).toBe(id);
    expect(count("client_relationships")).toBe(1);
    expect(
      db.sqlite
        .prepare("SELECT user_id FROM client_relationships WHERE id=?")
        .get(id)?.user_id,
    ).toBeNull();
    const detail = (
      (await (await request(`/clients/${id}`, "owner")).json()) as {
        data: { client: { linkedAccount: boolean; email: string } };
      }
    ).data;
    expect(detail.client.linkedAccount).toBe(false);
    expect(detail.client.email).toBe("client@example.test");
    expect(
      (
        await request("/clients", "owner", "POST", {
          name: "Injected",
          email: null,
          phone: null,
          userId: "client",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await request("/clients", "owner", "POST", {
          name: "Bad\nname",
          email: null,
          phone: null,
        })
      ).status,
    ).toBe(400);
  });
  it("scopes search, details, contact editing and history to the owning business", async () => {
    const id = await contact({
      name: "A%_ Client",
      email: "contact@example.test",
      phone: "+886 900 111 222",
    });
    await otherBusiness();
    expect((await request(`/clients/${id}`, "other")).status).toBe(404);
    expect((await request(`/clients/${id}`, "client")).status).toBe(409);
    expect(
      (
        await request(`/clients/${id}`, "other", "PATCH", {
          name: "Steal",
          email: null,
          phone: null,
          expectedRevision: 1,
        })
      ).status,
    ).toBe(404);
    const data = (
      (await (await request("/clients?q=%25_", "owner")).json()) as {
        data: { items: unknown[]; total: number };
      }
    ).data;
    expect(data.total).toBe(1);
    expect(data.items).toHaveLength(1);
    expect(
      (
        (await (await request("/clients?q=%25_", "other")).json()) as {
          data: { total: number };
        }
      ).data.total,
    ).toBe(0);
    expect((await request("/clients?orgId=org-demo", "other")).status).toBe(
      400,
    );
  });
  it("edits local contact fields with revision protection, leaving identity unchanged", async () => {
    await create();
    const row = db.sqlite
        .prepare("SELECT id FROM client_relationships WHERE user_id='client'")
        .get()!,
      id = String(row.id),
      value = {
        name: "Local nickname",
        email: "new-contact@example.test",
        phone: "+886 1234",
        expectedRevision: 1,
      };
    expect(
      (await request(`/clients/${id}`, "owner", "PATCH", value)).status,
    ).toBe(200);
    expect(
      (
        await request(`/clients/${id}`, "owner", "PATCH", {
          ...value,
          name: "Stale overwrite",
        })
      ).status,
    ).toBe(409);
    expect(
      db.sqlite.prepare("SELECT name FROM users WHERE id='client'").get()?.name,
    ).toBe("client");
    expect(
      db.sqlite
        .prepare(
          "SELECT provider_subject FROM identities WHERE user_id='client'",
        )
        .get()?.provider_subject,
    ).toBe("client@example.test");
    const detail = (
      (await (await request(`/clients/${id}`, "owner")).json()) as {
        data: {
          bookings: unknown[];
          client: {
            bookingCount: number;
            name: string;
            linkedAccount: boolean;
          };
        };
      }
    ).data;
    expect(detail.bookings).toHaveLength(1);
    expect(detail.client).toMatchObject({
      bookingCount: 1,
      name: "Local nickname",
      linkedAccount: true,
    });
  });
  it("paginates client lists and counts without exposing contacts from other tenants", async () => {
    const insert = db.sqlite.prepare(
      "INSERT INTO client_relationships (id,org_id,name) VALUES (?,'org-demo',?)",
    );
    for (let i = 0; i < 51; i++)
      insert.run(`client-${i}`, `Person ${String(i).padStart(2, "0")}`);
    const first = (
        (await (await request("/clients", "owner")).json()) as {
          data: { items: { id: string }[]; total: number };
        }
      ).data,
      second = (
        (await (await request("/clients?offset=50", "owner")).json()) as {
          data: { items: { id: string }[] };
        }
      ).data;
    expect(first.total).toBe(51);
    expect(first.items).toHaveLength(50);
    expect(second.items).toHaveLength(1);
    expect(first.items.some((c) => c.id === second.items[0]!.id)).toBe(false);
    expect((await request("/clients?offset=-1", "owner")).status).toBe(400);
  });
  it("records manual bookings once without claiming customer verification or linking contacts", async () => {
    const client = await contact(),
      key = crypto.randomUUID(),
      id = await manualBook(client, key);
    expect(await manualBook(client, key)).toBe(id);
    expect(count("bookings")).toBe(1);
    expect(count("booking_allocations")).toBe(4);
    const detail = (
      (await (await request(`/bookings/${id}`, "owner")).json()) as {
        data: {
          source: string;
          clientHasAccount: boolean;
          terms: { consentSource: string };
        };
      }
    ).data;
    expect(detail.source).toBe("PROVIDER_RECORDED");
    expect(detail.clientHasAccount).toBe(false);
    expect(detail.terms.consentSource).toBe("PROVIDER_REPORTED");
    expect((await request(`/bookings/${id}`, "client")).status).toBe(404);
    expect(
      (
        (await (await request("/bookings", "client")).json()) as {
          data: unknown[];
        }
      ).data,
    ).toEqual([]);
    const notifications = (
      (await (await request("/notifications", "client")).json()) as {
        data: { items: unknown[] };
      }
    ).data;
    expect(notifications.items).toEqual([]);
    expect(count("notifications")).toBe(1);
  });
  it("requires an explicit attestation and a tenant-owned client and service", async () => {
    const client = await contact();
    expect(
      (
        await request("/business/bookings", "owner", "POST", {
          ...manualInput(client),
          confirmedWithClient: false,
        })
      ).status,
    ).toBe(400);
    await otherBusiness();
    expect(
      (
        await request(
          "/business/bookings",
          "other",
          "POST",
          manualInput(client),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          `/business/services/${input.serviceId}/availability?offeringId=${input.offeringId}&date=2026-10-21`,
          "other",
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request("/business/bookings", "owner", "POST", {
          ...manualInput(client),
          expectedServiceRevision: 99,
        })
      ).status,
    ).toBe(409);
  });
  it("lets the owner record within customer notice but still enforces hours and conflicts", async () => {
    const client = await contact();
    vi.spyOn(Date, "now").mockReturnValue(start - 3_600_000);
    expect((await request("/bookings", "client", "POST", input)).status).toBe(
      409,
    );
    const id = await manualBook(client);
    expect(
      (
        await request(
          "/business/bookings",
          "owner",
          "POST",
          manualInput(client),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request("/business/bookings", "owner", "POST", {
          ...manualInput(client),
          startsAt: start - 3_600_000,
        })
      ).status,
    ).toBe(409);
    expect(db.sqlite.prepare("SELECT id FROM bookings").get()?.id).toBe(id);
  });
  it("blocks unpublished services for manual bookings but permits a hidden business profile", async () => {
    const client = await contact();
    db.sqlite.exec(
      "UPDATE services SET status='UNPUBLISHED' WHERE id='service-demo-tennis';UPDATE provider_profiles SET published=0 WHERE org_id='org-demo'",
    );
    expect(
      (
        await request(
          `/services/${input.serviceId}/availability?offeringId=${input.offeringId}&date=2026-10-21`,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          "/business/bookings",
          "owner",
          "POST",
          manualInput(client),
        )
      ).status,
    ).toBe(404);
    db.sqlite.exec(
      "UPDATE services SET status='PUBLISHED' WHERE id='service-demo-tennis'",
    );
    await manualBook(client);
  });
  it("rolls back manual allocation, client creation and receipts when audit/outbox fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const key = crypto.randomUUID();
    db.sqlite.exec(
      "CREATE TRIGGER fail_client_audit BEFORE INSERT ON audit_logs WHEN NEW.action='client.created' BEGIN SELECT RAISE(ABORT,'injected'); END",
    );
    expect(
      (
        await request(
          "/clients",
          "owner",
          "POST",
          { name: "New", email: null, phone: null },
          key,
        )
      ).status,
    ).toBe(500);
    expect(count("client_relationships")).toBe(0);
    expect(count("idempotency_records")).toBe(0);
    db.sqlite.exec("DROP TRIGGER fail_client_audit");
    const client = await contact();
    db.sqlite.exec(
      "CREATE TRIGGER fail_booking_outbox BEFORE INSERT ON outbox_events BEGIN SELECT RAISE(ABORT,'injected'); END",
    );
    expect(
      (
        await request(
          "/business/bookings",
          "owner",
          "POST",
          manualInput(client),
          key,
        )
      ).status,
    ).toBe(500);
    expect(count("bookings")).toBe(0);
    expect(count("booking_allocations")).toBe(0);
    expect(count("transaction_guards")).toBe(0);
    db.sqlite.exec("DROP TRIGGER fail_booking_outbox");
    await manualBook(client, key);
  });
  it("exports private ICS with stable UID and updated sequence/time/status after changes", async () => {
    const client = await contact(),
      id = await manualBook(client),
      before = await request(`/bookings/${id}/calendar.ics`, "owner");
    expect(before.status).toBe(200);
    const anonymous = await app.request(
      origin + `/api/v1/bookings/${id}/calendar.ics`,
      {},
      { DB: db.binding },
    );
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get("Content-Disposition")).toBeNull();

    expect(before.headers.get("Content-Type")).toContain("text/calendar");
    expect(before.headers.get("Cache-Control")).toContain("no-store");
    expect(
      (await request(`/bookings/${id}/calendar.ics`, "other")).status,
    ).toBe(404);
    const initial = await before.text(),
      uid = initial.match(/^UID:(.*)$/m)![1]!.trim();
    expect(initial).toContain("DTSTART:20261021T020000Z\r\n");
    expect(initial).toContain("SEQUENCE:0\r\n");
    expect(initial).not.toContain("client@example.test");
    expect(initial).not.toContain("ATTENDEE:");
    const next = start + 3_600_000;
    expect(
      (
        await request(`/bookings/${id}/manual-reschedule`, "owner", "POST", {
          expectedVersion: 1,
          startsAt: next,
          confirmedWithClient: true,
          reason: "Agreed by phone",
        })
      ).status,
    ).toBe(200);
    const moved = await (
      await request(`/bookings/${id}/calendar.ics`, "owner")
    ).text();
    expect(moved).toContain(`UID:${uid}\r\n`);
    expect(moved).toContain("DTSTART:20261021T030000Z\r\n");
    expect(moved).toContain("SEQUENCE:1\r\n");
    expect(
      (
        await request(`/bookings/${id}/cancel`, "owner", "POST", {
          expectedVersion: 2,
          reason: "Cancelled by agreement",
        })
      ).status,
    ).toBe(200);
    const cancelled = await (
      await request(`/bookings/${id}/calendar.ics`, "owner")
    ).text();
    expect(cancelled).toContain(`UID:${uid}\r\n`);
    expect(cancelled).toContain("STATUS:CANCELLED\r\n");
    expect(cancelled).toContain("SEQUENCE:2\r\n");
    expect(count("booking_allocations")).toBe(0);
  });
  it("manual reschedule is restricted to unlinked, provider-recorded bookings", async () => {
    const linkedBooking = await create();
    expect(
      (
        await request(
          `/bookings/${linkedBooking}/manual-reschedule`,
          "owner",
          "POST",
          {
            expectedVersion: 1,
            startsAt: start + 3_600_000,
            confirmedWithClient: true,
            reason: "Bypass",
          },
        )
      ).status,
    ).toBe(409);
    const client = await contact(),
      id = await manualBook(client, undefined, start + 2 * 3_600_000);
    expect(
      (
        await request(`/bookings/${id}/manual-reschedule`, "owner", "POST", {
          expectedVersion: 1,
          startsAt: start,
          confirmedWithClient: true,
          reason: "Conflict",
        })
      ).status,
    ).toBe(409);
    expect(
      db.sqlite
        .prepare("SELECT starts_at,version FROM bookings WHERE id=?")
        .get(id),
    ).toMatchObject({ starts_at: start + 2 * 3_600_000, version: 1 });
  });
  it("failed replacement allocation leaves the original manual booking and terms untouched", async () => {
    const client = await contact(),
      id = await manualBook(client),
      next = start + 3_600_000;
    const original = db.sqlite
      .prepare("SELECT terms_snapshot FROM bookings WHERE id=?")
      .get(id)?.terms_snapshot;
    db.sqlite.exec(
      `CREATE TRIGGER fail_replacement BEFORE INSERT ON booking_allocations WHEN NEW.slot_start_utc>=${next} BEGIN SELECT RAISE(ABORT,'injected'); END`,
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    const key = crypto.randomUUID(),
      value = {
        expectedVersion: 1,
        startsAt: next,
        confirmedWithClient: true,
        reason: "Agreed",
      };
    expect(
      (
        await request(
          `/bookings/${id}/manual-reschedule`,
          "owner",
          "POST",
          value,
          key,
        )
      ).status,
    ).toBe(500);
    expect(
      db.sqlite
        .prepare(
          "SELECT starts_at,version,terms_snapshot FROM bookings WHERE id=?",
        )
        .get(id),
    ).toMatchObject({ starts_at: start, version: 1, terms_snapshot: original });
    expect(count("booking_allocations")).toBe(4);
    db.sqlite.exec("DROP TRIGGER fail_replacement");
    expect(
      (
        await request(
          `/bookings/${id}/manual-reschedule`,
          "owner",
          "POST",
          value,
          key,
        )
      ).status,
    ).toBe(200);
  });
  it("derives providers only from the current user's bookings and public active profiles", async () => {
    await create();
    expect(
      (
        (await (await request("/my-providers", "client")).json()) as {
          data: { slug: string }[];
        }
      ).data,
    ).toMatchObject([{ slug: "demo-coach" }]);
    expect(
      (
        (await (await request("/my-providers", "other")).json()) as {
          data: unknown[];
        }
      ).data,
    ).toEqual([]);
    db.sqlite.exec("UPDATE provider_profiles SET published=0");
    expect(
      (
        (await (await request("/my-providers", "client")).json()) as {
          data: unknown[];
        }
      ).data,
    ).toEqual([]);
  });
});
