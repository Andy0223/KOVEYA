import { Hono } from "hono";
import { z } from "zod";
import type { Environment } from "../../environment";
import type { BookingRequest, BookingTerms } from "../../../src/shared/booking";
import { ApiError, body, ok } from "../../http";
import { requireUser } from "../identity/session";
import { availableSlots, validDate } from "./availability";
import { bookableService, dateOf, readSchedule, slotsFor } from "./repository";
import { bookingStatements, clientStatement, termsFor } from "./booking-write";
import { receipt } from "./transactions";

export const requestRoutes = new Hono<Environment>();
const version = z.number().int().positive(),
  startTime = z
    .number()
    .int()
    .positive()
    .max(8_000_000_000_000)
    .multipleOf(900_000);
interface Row {
  id: string;
  orgId: string;
  offeringId: string;
  clientUser: string;
  ownerUser: string | null;
  clientName: string;
  startsAt: number;
  originalStartsAt: number;
  terms: string;
  version: number;
  status: BookingRequest["status"];
  expiresAt: number;
  bookingId: string | null;
}
const select = `SELECT r.id,r.org_id AS orgId,r.offering_id AS offeringId,c.user_id AS clientUser,c.name AS clientName,o.owner_user_id AS ownerUser,r.starts_at AS startsAt,r.original_starts_at AS originalStartsAt,r.terms_snapshot AS terms,r.version,r.status,r.expires_at AS expiresAt,r.booking_id AS bookingId FROM booking_requests r JOIN client_relationships c ON c.id=r.client_id AND c.org_id=r.org_id JOIN organizations o ON o.id=r.org_id`;
const live = (row: Row, now = Date.now()) =>
  ["SUBMITTED", "COUNTER_PROPOSED"].includes(row.status) && row.expiresAt > now;
function dto(row: Row, user: string): BookingRequest {
  return {
    id: row.id,
    startsAt: row.startsAt,
    originalStartsAt: row.originalStartsAt,
    terms: JSON.parse(row.terms),
    version: row.version,
    status:
      !live(row) && ["SUBMITTED", "COUNTER_PROPOSED"].includes(row.status)
        ? "EXPIRED"
        : row.status,
    expiresAt: row.expiresAt,
    bookingId: row.bookingId,
    clientName: row.clientName,
    isProvider: row.ownerUser === user,
  };
}
async function owned(db: D1Database, id: string, user: string) {
  const row = await db
    .prepare(
      select +
        ` WHERE r.id=? AND (c.user_id=? OR (o.owner_user_id=? AND o.status='ACTIVE' AND EXISTS (SELECT 1 FROM organization_members m WHERE m.org_id=o.id AND m.user_id=? AND m.role='OWNER')))`,
    )
    .bind(id, user, user, user)
    .first<Row>();
  if (!row) throw new ApiError("NOT_FOUND", 404);
  return row;
}
function guard(
  db: D1Database,
  id: string,
  row: Row,
  user: string,
  now: number,
) {
  return db
    .prepare(
      `INSERT INTO transaction_guards (id,passed) VALUES (?,CASE WHEN EXISTS (
  SELECT 1 FROM booking_requests r JOIN organizations o ON o.id=r.org_id AND o.status='ACTIVE'
  JOIN client_relationships c ON c.id=r.client_id AND c.org_id=r.org_id JOIN users u ON u.id=? AND u.status='ACTIVE'
  WHERE r.id=? AND r.version=? AND r.status=? AND r.expires_at>?
  AND (c.user_id=u.id OR (o.owner_user_id=u.id AND EXISTS (SELECT 1 FROM organization_members m WHERE m.org_id=o.id AND m.user_id=u.id AND m.role='OWNER')))) THEN 1 ELSE 0 END)`,
    )
    .bind(id, user, row.id, row.version, row.status, now);
}
export function requestEvent(
  db: D1Database,
  org: string,
  id: string,
  actor: string,
  type: string,
  payload: unknown,
  now: number,
) {
  return [
    db
      .prepare(
        "INSERT INTO request_events (id,request_id,org_id,actor_id,event_type,payload,created_at) VALUES (?,?,?,?,?,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        id,
        org,
        actor,
        type,
        JSON.stringify(payload),
        now,
      ),
    db
      .prepare(
        "INSERT INTO outbox_events (id,org_id,event_type,payload,next_attempt_at,created_at) VALUES (?,?,?,?,?,?)",
      )
      .bind(
        crypto.randomUUID(),
        org,
        type,
        JSON.stringify({ requestId: id, ...(payload as object) }),
        now,
        now,
      ),
    db
      .prepare(
        "INSERT INTO audit_logs (id,actor_id,org_id,action,entity_id,created_at) VALUES (?,?,?,?,?,?)",
      )
      .bind(crypto.randomUUID(), actor, org, type, id, now),
  ];
}
async function candidates(db: D1Database, row: Row, date: string, now: number) {
  const terms = JSON.parse(row.terms) as BookingTerms,
    schedule = await readSchedule(db, terms.resourceId),
    midnight = Date.parse(date);
  const occupied = await db
    .prepare(
      "SELECT slot_start_utc AS slot FROM booking_allocations WHERE resource_id=? AND slot_start_utc>=? AND slot_start_utc<?",
    )
    .bind(
      terms.resourceId,
      midnight - 2 * 86_400_000,
      midnight + 3 * 86_400_000,
    )
    .all<{ slot: number }>();
  return {
    terms,
    schedule,
    slots: availableSlots(
      date,
      schedule,
      terms,
      new Set(occupied.results.map((r) => r.slot)),
      now,
    ),
  };
}
requestRoutes.post("/booking-requests", requireUser, async (c) => {
  const input = await body(
      c,
      z
        .object({
          serviceId: z.string().min(1).max(100),
          offeringId: z.string().min(1).max(100),
          startsAt: startTime,
          expectedServiceRevision: version,
          acceptTerms: z.literal(true),
        })
        .strict(),
    ),
    db = c.env.DB,
    user = c.get("userId"),
    tx = await receipt(c, "request.create", input);
  return tx.respond(async () => {
    const replay = await tx.replay();
    if (replay) return ok(c, replay);
    const service = await bookableService(
      db,
      input.serviceId,
      input.offeringId,
    );
    if (service.revision !== input.expectedServiceRevision)
      throw new ApiError("STATE_CONFLICT", 409);
    if (service.mode !== "REQUEST" || service.priceMinor === null)
      throw new ApiError("POLICY_VIOLATION", 409);
    const now = Date.now(),
      { slots, schedule } = await slotsFor(
        db,
        service,
        dateOf(input.startsAt, service.timezone),
        now,
      ),
      terms = termsFor(service, now);
    if (!slots.includes(input.startsAt))
      throw new ApiError("SLOT_UNAVAILABLE", 409);
    const owner = await db
      .prepare("SELECT owner_user_id AS owner FROM organizations WHERE id=?")
      .bind(service.orgId)
      .first<{ owner: string | null }>();
    if (owner?.owner === user) throw new ApiError("POLICY_VIOLATION", 409);
    const expires = Math.min(
      now + 86_400_000,
      input.startsAt - Math.max(15, terms.minNoticeMinutes) * 60_000,
    );
    if (expires <= now) throw new ApiError("POLICY_VIOLATION", 409);
    const id = crypto.randomUUID(),
      g = crypto.randomUUID();
    return ok(
      c,
      await tx.commit(id, [
        db
          .prepare(
            `INSERT INTO transaction_guards (id,passed) VALUES (?,CASE WHEN EXISTS (SELECT 1 FROM services s JOIN organizations o ON o.id=s.org_id AND o.status='ACTIVE' JOIN provider_profiles p ON p.org_id=s.org_id AND p.published=1 JOIN service_resources sr ON sr.service_id=s.id AND sr.org_id=s.org_id JOIN resources r ON r.id=sr.resource_id WHERE s.id=? AND s.revision=? AND s.status='PUBLISHED' AND r.revision=? AND r.id=?) THEN 1 ELSE 0 END)`,
          )
          .bind(
            g,
            service.id,
            service.revision,
            schedule.revision,
            service.resourceId,
          ),
        clientStatement(db, service.orgId, user),
        db
          .prepare(
            `INSERT INTO booking_requests (id,org_id,offering_id,client_id,starts_at,original_starts_at,terms_snapshot,expires_at,created_at)
        SELECT ?,?,?,id,?,?,?,?,? FROM client_relationships WHERE org_id=? AND user_id=?`,
          )
          .bind(
            id,
            service.orgId,
            service.offeringId,
            input.startsAt,
            input.startsAt,
            JSON.stringify(terms),
            expires,
            now,
            service.orgId,
            user,
          ),
        ...requestEvent(
          db,
          service.orgId,
          id,
          user,
          "request.submitted",
          { startsAt: input.startsAt },
          now,
        ),
        db.prepare("DELETE FROM transaction_guards WHERE id=?").bind(g),
      ]),
    );
  });
});
requestRoutes.get("/booking-requests", requireUser, async (c) => {
  const user = c.get("userId"),
    scope = c.req.query("scope") ?? "demand";
  if (!["demand", "business"].includes(scope))
    throw new ApiError("VALIDATION_ERROR", 400);
  const filter =
    scope === "demand"
      ? "c.user_id=?"
      : "o.owner_user_id=? AND o.status='ACTIVE' AND EXISTS (SELECT 1 FROM organization_members m WHERE m.org_id=o.id AND m.user_id=o.owner_user_id AND m.role='OWNER')";
  const rows = await c.env.DB.prepare(
    select +
      ` WHERE ${filter} ORDER BY r.created_at DESC,r.rowid DESC LIMIT 100`,
  )
    .bind(user)
    .all<Row>();
  return ok(
    c,
    rows.results.map((r) => dto(r, user)),
  );
});
requestRoutes.get("/booking-requests/:id", requireUser, async (c) => {
  const row = await owned(c.env.DB, c.req.param("id"), c.get("userId"));
  const events = await c.env.DB.prepare(
    "SELECT event_type AS eventType,payload,created_at AS createdAt FROM request_events WHERE request_id=? AND org_id=? ORDER BY created_at,rowid",
  )
    .bind(row.id, row.orgId)
    .all<{ eventType: string; payload: string; createdAt: number }>();
  return ok(c, {
    ...dto(row, c.get("userId")),
    events: events.results.map((e) => ({
      ...e,
      payload: JSON.parse(e.payload),
    })),
  });
});
requestRoutes.get(
  "/booking-requests/:id/availability",
  requireUser,
  async (c) => {
    const date = c.req.query("date") ?? "";
    if (!validDate(date)) throw new ApiError("VALIDATION_ERROR", 400);
    const row = await owned(c.env.DB, c.req.param("id"), c.get("userId"));
    if (!live(row)) throw new ApiError("STATE_CONFLICT", 409);
    const { terms, slots } = await candidates(c.env.DB, row, date, Date.now());
    return ok(c, { date, timezone: terms.timezone, slots });
  },
);
requestRoutes.post(
  "/booking-requests/:id/counter-proposals",
  requireUser,
  async (c) => {
    const input = await body(
        c,
        z.object({ expectedVersion: version, startsAt: startTime }).strict(),
      ),
      db = c.env.DB,
      user = c.get("userId"),
      id = c.req.param("id"),
      tx = await receipt(c, `request.counter:${id}`, input);
    return tx.respond(async () => {
      const replay = await tx.replay();
      if (replay) return ok(c, replay);
      const row = await owned(db, id, user),
        now = Date.now();
      if (row.ownerUser !== user) throw new ApiError("FORBIDDEN", 403);
      if (!live(row, now) || row.version !== input.expectedVersion)
        throw new ApiError("STATE_CONFLICT", 409);
      const terms = JSON.parse(row.terms) as BookingTerms,
        { slots } = await candidates(
          db,
          row,
          dateOf(input.startsAt, terms.timezone),
          now,
        );
      if (input.startsAt === row.startsAt || !slots.includes(input.startsAt))
        throw new ApiError("SLOT_UNAVAILABLE", 409);
      const expires = Math.min(
          row.expiresAt,
          input.startsAt - Math.max(15, terms.minNoticeMinutes) * 60_000,
        ),
        g = crypto.randomUUID();
      if (expires <= now) throw new ApiError("POLICY_VIOLATION", 409);
      return ok(
        c,
        await tx.commit(id, [
          guard(db, g, row, user, now),
          db
            .prepare(
              "UPDATE booking_requests SET starts_at=?,status='COUNTER_PROPOSED',version=version+1,expires_at=? WHERE id=?",
            )
            .bind(input.startsAt, expires, id),
          ...requestEvent(
            db,
            row.orgId,
            id,
            user,
            "request.counter_proposed",
            { startsAt: input.startsAt },
            now,
          ),
          db.prepare("DELETE FROM transaction_guards WHERE id=?").bind(g),
        ]),
      );
    });
  },
);
requestRoutes.post("/booking-requests/:id/accept", requireUser, async (c) => {
  const input = await body(
      c,
      z
        .object({ expectedVersion: version, acceptTerms: z.literal(true) })
        .strict(),
    ),
    db = c.env.DB,
    user = c.get("userId"),
    id = c.req.param("id"),
    tx = await receipt(c, `request.accept:${id}`, input);
  return tx.respond(async () => {
    const replay = await tx.replay();
    if (replay) return ok(c, replay);
    const row = await owned(db, id, user),
      now = Date.now();
    if (!live(row, now) || row.version !== input.expectedVersion)
      throw new ApiError("STATE_CONFLICT", 409);
    if (
      (row.status === "SUBMITTED" && row.ownerUser !== user) ||
      (row.status === "COUNTER_PROPOSED" && row.clientUser !== user)
    )
      throw new ApiError("FORBIDDEN", 403);
    const { terms, schedule, slots } = await candidates(
      db,
      row,
      dateOf(row.startsAt, (JSON.parse(row.terms) as BookingTerms).timezone),
      now,
    );
    const service = await bookableService(db, terms.serviceId, row.offeringId);
    if (service.resourceId !== terms.resourceId)
      throw new ApiError("STATE_CONFLICT", 409);
    if (!slots.includes(row.startsAt))
      throw new ApiError("SLOT_UNAVAILABLE", 409);
    const booking = crypto.randomUUID(),
      g = crypto.randomUUID();
    return ok(
      c,
      await tx.commit(id, [
        guard(db, g, row, user, now),
        db
          .prepare(
            `INSERT INTO transaction_guards (id,passed) VALUES (?,CASE WHEN EXISTS (SELECT 1 FROM services s JOIN organizations o ON o.id=s.org_id AND o.status='ACTIVE' JOIN provider_profiles p ON p.org_id=s.org_id AND p.published=1 JOIN resources r ON r.id=? AND r.org_id=s.org_id WHERE s.id=? AND s.revision=? AND s.status='PUBLISHED' AND r.revision=? AND EXISTS (SELECT 1 FROM users WHERE id=? AND status='ACTIVE')) THEN 1 ELSE 0 END)`,
          )
          .bind(
            g + "-service",
            terms.resourceId,
            service.id,
            service.revision,
            schedule.revision,
            row.clientUser,
          ),
        ...bookingStatements(
          db,
          booking,
          row.orgId,
          row.offeringId,
          row.clientUser,
          user,
          row.startsAt,
          row.status === "COUNTER_PROPOSED"
            ? { ...terms, acceptedAt: now }
            : terms,
          now,
        ),
        db
          .prepare(
            "UPDATE booking_requests SET status='ACCEPTED',version=version+1,booking_id=? WHERE id=?",
          )
          .bind(booking, id),
        ...requestEvent(
          db,
          row.orgId,
          id,
          user,
          "request.accepted",
          { bookingId: booking },
          now,
        ),
        db
          .prepare("DELETE FROM transaction_guards WHERE id IN (?,?)")
          .bind(g, g + "-service"),
      ]),
    );
  });
});
for (const [action, status] of [
  ["reject", "REJECTED"],
  ["withdraw", "WITHDRAWN"],
  ["decline", "DECLINED"],
] as const) {
  requestRoutes.post(
    `/booking-requests/:id/${action}`,
    requireUser,
    async (c) => {
      const input = await body(
          c,
          z
            .object({
              expectedVersion: version,
              reason: z.string().trim().min(1).max(500),
            })
            .strict(),
        ),
        db = c.env.DB,
        user = c.get("userId"),
        id = c.req.param("id"),
        tx = await receipt(c, `request.${action}:${id}`, input);
      return tx.respond(async () => {
        const replay = await tx.replay();
        if (replay) return ok(c, replay);
        const row = await owned(db, id, user),
          now = Date.now();
        if (!live(row, now) || row.version !== input.expectedVersion)
          throw new ApiError("STATE_CONFLICT", 409);
        if (
          action === "reject" ? row.ownerUser !== user : row.clientUser !== user
        )
          throw new ApiError("FORBIDDEN", 403);
        if (action === "decline" && row.status !== "COUNTER_PROPOSED")
          throw new ApiError("STATE_CONFLICT", 409);
        const g = crypto.randomUUID();
        return ok(
          c,
          await tx.commit(id, [
            guard(db, g, row, user, now),
            db
              .prepare(
                "UPDATE booking_requests SET status=?,version=version+1 WHERE id=?",
              )
              .bind(status, id),
            ...requestEvent(
              db,
              row.orgId,
              id,
              user,
              `request.${status.toLowerCase()}`,
              { reason: input.reason },
              now,
            ),
            db.prepare("DELETE FROM transaction_guards WHERE id=?").bind(g),
          ]),
        );
      });
    },
  );
}
