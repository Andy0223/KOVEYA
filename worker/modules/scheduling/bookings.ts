import { Hono } from "hono";
import { z } from "zod";
import type { Environment } from "../../environment";
import type { Booking, BookingTerms } from "../../../src/shared/booking";
import { ApiError, body, ok } from "../../http";
import { requireUser } from "../identity/session";
import { bookableService, dateOf, readSchedule, slotsFor } from "./repository";
import { availableSlots, validDate } from "./availability";
import { allocationSlots } from "./slots";
import { eventStatements, receipt } from "./transactions";

export const bookingRoutes = new Hono<Environment>();
const newBooking = z
  .object({
    serviceId: z.string().min(1).max(100),
    offeringId: z.string().min(1).max(100),
    startsAt: z
      .number()
      .int()
      .positive()
      .max(8_000_000_000_000)
      .multipleOf(900_000),
    expectedServiceRevision: z.number().int().positive(),
    acceptTerms: z.literal(true),
  })
  .strict();
bookingRoutes.post("/bookings", requireUser, async (c) => {
  const input = await body(c, newBooking),
    db = c.env.DB,
    user = c.get("userId"),
    transaction = await receipt(c, "booking.create", input);
  return transaction.respond(async () => {
    const previous = await transaction.replay();
    if (previous) return ok(c, previous);
    const service = await bookableService(
      db,
      input.serviceId,
      input.offeringId,
    );
    if (service.revision !== input.expectedServiceRevision)
      throw new ApiError("STATE_CONFLICT", 409);
    if (service.mode !== "INSTANT" || service.priceMinor === null)
      throw new ApiError("POLICY_VIOLATION", 409);
    const now = Date.now(),
      { slots, schedule } = await slotsFor(
        db,
        service,
        dateOf(input.startsAt, service.timezone),
        now,
      );
    if (!slots.includes(input.startsAt)) {
      const replay = await transaction.replay();
      if (replay) return ok(c, replay);
      throw new ApiError("SLOT_UNAVAILABLE", 409);
    }
    const id = crypto.randomUUID(),
      guard = crypto.randomUUID(),
      end = input.startsAt + service.durationMinutes * 60_000;
    const terms: BookingTerms = {
      serviceId: service.id,
      serviceRevision: service.revision,
      serviceName: service.name,
      providerName: service.providerName,
      providerSlug: service.providerSlug,
      resourceId: service.resourceId,
      timezone: service.timezone,
      locationLabel: service.locationLabel,
      durationMinutes: service.durationMinutes,
      bufferBeforeMinutes: service.bufferBeforeMinutes,
      bufferAfterMinutes: service.bufferAfterMinutes,
      priceMinor: service.priceMinor,
      currency: service.currency,
      cancellationPolicy: service.cancellationPolicy,
      cancellationNoticeMinutes: service.cancellationNoticeMinutes,
      minNoticeMinutes: service.minNoticeMinutes,
      maxAdvanceDays: service.maxAdvanceDays,
      paymentMethod: "ARRANGED_WITH_PROVIDER",
      acceptedAt: now,
    };
    return ok(
      c,
      await transaction.commit(id, [
        db
          .prepare(
            `INSERT INTO transaction_guards (id,passed) VALUES (?,CASE WHEN EXISTS (
      SELECT 1 FROM services s JOIN organizations o ON o.id=s.org_id AND o.status='ACTIVE'
      JOIN provider_profiles p ON p.org_id=s.org_id AND p.published=1
      JOIN service_resources sr ON sr.service_id=s.id AND sr.org_id=s.org_id
      JOIN resources r ON r.id=sr.resource_id AND r.org_id=s.org_id
      WHERE s.id=? AND s.revision=? AND s.status='PUBLISHED' AND r.id=? AND r.revision=?
      AND EXISTS (SELECT 1 FROM users WHERE id=? AND status='ACTIVE')) THEN 1 ELSE 0 END)`,
          )
          .bind(
            guard,
            service.id,
            service.revision,
            service.resourceId,
            schedule.revision,
            user,
          ),
        db
          .prepare(
            `INSERT INTO client_relationships (id,org_id,user_id,name,email)
      SELECT ?,?,u.id,u.name,i.provider_subject FROM users u JOIN identities i ON i.user_id=u.id AND i.provider='email' WHERE u.id=?
      ON CONFLICT(org_id,user_id) DO NOTHING`,
          )
          .bind(crypto.randomUUID(), service.orgId, user),
        db
          .prepare(
            `INSERT INTO bookings (id,org_id,offering_id,client_id,starts_at,ends_at,status,terms_snapshot,created_at,version)
      SELECT ?,?,?,id,?,?,'CONFIRMED',?,?,1 FROM client_relationships WHERE org_id=? AND user_id=?`,
          )
          .bind(
            id,
            service.orgId,
            service.offeringId,
            input.startsAt,
            end,
            JSON.stringify(terms),
            now,
            service.orgId,
            user,
          ),
        db
          .prepare(
            "INSERT INTO booking_allocations (org_id,booking_id,resource_id,slot_start_utc) SELECT ?,?,?,value FROM json_each(?)",
          )
          .bind(
            service.orgId,
            id,
            service.resourceId,
            JSON.stringify(
              allocationSlots(
                input.startsAt,
                service.durationMinutes,
                service.bufferBeforeMinutes,
                service.bufferAfterMinutes,
              ),
            ),
          ),
        ...eventStatements(
          db,
          service.orgId,
          id,
          user,
          "booking.confirmed",
          { startsAt: input.startsAt, endsAt: end },
          now,
        ),
        db.prepare("DELETE FROM transaction_guards WHERE id=?").bind(guard),
      ]),
    );
  });
});
interface BookingRow {
  id: string;
  orgId: string;
  startsAt: number;
  endsAt: number;
  status: Booking["status"];
  version: number;
  terms: string;
  clientName: string;
  clientUser: string;
  ownerUser: string;
}
const selectBooking = `SELECT b.id,b.org_id AS orgId,b.starts_at AS startsAt,b.ends_at AS endsAt,b.status,b.version,b.terms_snapshot AS terms,c.name AS clientName,c.user_id AS clientUser,o.owner_user_id AS ownerUser
  FROM bookings b JOIN client_relationships c ON c.id=b.client_id AND c.org_id=b.org_id JOIN organizations o ON o.id=b.org_id`;
function dto(row: BookingRow, user: string): Booking {
  return {
    id: row.id,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: row.status,
    version: row.version,
    terms: JSON.parse(row.terms),
    clientName: row.clientName,
    isProvider: row.ownerUser === user,
  };
}
async function ownedBooking(db: D1Database, id: string, user: string) {
  const row = await db
    .prepare(
      selectBooking +
        " WHERE b.id=? AND (c.user_id=? OR (o.owner_user_id=? AND o.status='ACTIVE' AND EXISTS (SELECT 1 FROM organization_members m WHERE m.org_id=o.id AND m.user_id=? AND m.role='OWNER')))",
    )
    .bind(id, user, user, user)
    .first<BookingRow>();
  if (!row) throw new ApiError("NOT_FOUND", 404);
  return row;
}
bookingRoutes.get("/bookings", requireUser, async (c) => {
  const scope = c.req.query("scope") ?? "demand",
    user = c.get("userId");
  if (!["demand", "business"].includes(scope))
    throw new ApiError("VALIDATION_ERROR", 400);
  const filter =
    scope === "demand"
      ? "c.user_id=?"
      : "o.owner_user_id=? AND o.status='ACTIVE' AND EXISTS (SELECT 1 FROM organization_members m WHERE m.org_id=o.id AND m.user_id=o.owner_user_id AND m.role='OWNER')";
  const rows = await c.env.DB.prepare(
    selectBooking + ` WHERE ${filter} ORDER BY b.starts_at DESC LIMIT 200`,
  )
    .bind(user)
    .all<BookingRow>();
  return ok(
    c,
    rows.results.map((row) => dto(row, user)),
  );
});
bookingRoutes.get("/bookings/:id", requireUser, async (c) => {
  const row = await ownedBooking(c.env.DB, c.req.param("id"), c.get("userId"));
  const events = await c.env.DB.prepare(
    "SELECT event_type AS eventType,payload,created_at AS createdAt FROM booking_events WHERE booking_id=? AND org_id=? ORDER BY created_at,rowid",
  )
    .bind(row.id, row.orgId)
    .all<{ eventType: string; payload: string; createdAt: number }>();
  const proposals = await c.env.DB.prepare(
    "SELECT id,starts_at AS startsAt,status,expires_at AS expiresAt,responder_id AS responder FROM reschedule_requests WHERE booking_id=? AND org_id=? ORDER BY created_at DESC LIMIT 50",
  )
    .bind(row.id, row.orgId)
    .all<{
      id: string;
      startsAt: number;
      status: string;
      expiresAt: number;
      responder: string;
    }>();
  return ok(c, {
    ...dto(row, c.get("userId")),
    proposals: proposals.results.map((p) => ({
      id: p.id,
      startsAt: p.startsAt,
      status:
        p.status === "PENDING" && p.expiresAt <= Date.now()
          ? "EXPIRED"
          : p.status,
      expiresAt: p.expiresAt,
      canRespond: p.responder === c.get("userId"),
    })),
    events: events.results.map((e) => ({
      ...e,
      payload: JSON.parse(e.payload),
    })),
  });
});
bookingRoutes.post("/bookings/:id/cancel", requireUser, async (c) => {
  const input = await body(
    c,
    z
      .object({
        expectedVersion: z.number().int().positive(),
        reason: z.string().trim().min(1).max(500),
      })
      .strict(),
  );
  const db = c.env.DB,
    user = c.get("userId"),
    id = c.req.param("id"),
    transaction = await receipt(c, `booking.cancel:${id}`, input);
  return transaction.respond(async () => {
    const previous = await transaction.replay();
    if (previous) return ok(c, previous);
    const row = await ownedBooking(db, id, user),
      terms = JSON.parse(row.terms) as BookingTerms,
      now = Date.now();
    if (row.status !== "CONFIRMED" || row.version !== input.expectedVersion)
      throw new ApiError("STATE_CONFLICT", 409);
    if (
      now >= row.startsAt ||
      (row.ownerUser !== user &&
        now > row.startsAt - terms.cancellationNoticeMinutes * 60_000)
    )
      throw new ApiError("POLICY_VIOLATION", 409);
    const guard = crypto.randomUUID();
    return ok(
      c,
      await transaction.commit(id, [
        db
          .prepare(
            `INSERT INTO transaction_guards (id,passed) VALUES (?,CASE WHEN EXISTS (
      SELECT 1 FROM bookings WHERE id=? AND version=? AND status='CONFIRMED') THEN 1 ELSE 0 END)`,
          )
          .bind(guard, id, input.expectedVersion),
        db
          .prepare(
            "UPDATE bookings SET status='CANCELLED',version=version+1 WHERE id=?",
          )
          .bind(id),
        db
          .prepare(
            "DELETE FROM booking_allocations WHERE booking_id=? AND org_id=?",
          )
          .bind(id, row.orgId),
        db
          .prepare(
            "UPDATE reschedule_requests SET status='CANCELLED' WHERE booking_id=? AND status='PENDING'",
          )
          .bind(id),
        ...eventStatements(
          db,
          row.orgId,
          id,
          user,
          "booking.cancelled",
          {
            reason: input.reason,
            by: row.ownerUser === user ? "provider" : "customer",
          },
          now,
        ),
        db.prepare("DELETE FROM transaction_guards WHERE id=?").bind(guard),
      ]),
    );
  });
});

async function rescheduleSlots(
  db: D1Database,
  row: BookingRow,
  date: string,
  now: number,
) {
  const terms = JSON.parse(row.terms) as BookingTerms;
  const schedule = await readSchedule(db, terms.resourceId),
    midnight = Date.parse(date);
  const occupied = await db
    .prepare(
      "SELECT slot_start_utc AS slot FROM booking_allocations WHERE resource_id=? AND booking_id<>? AND slot_start_utc>=? AND slot_start_utc<?",
    )
    .bind(
      terms.resourceId,
      row.id,
      midnight - 2 * 86_400_000,
      midnight + 3 * 86_400_000,
    )
    .all<{ slot: number }>();
  return {
    schedule,
    terms,
    slots: availableSlots(
      date,
      schedule,
      terms,
      new Set(occupied.results.map((r) => r.slot)),
      now,
    ),
  };
}
bookingRoutes.get("/bookings/:id/availability", requireUser, async (c) => {
  const date = c.req.query("date") ?? "";
  if (!validDate(date)) throw new ApiError("VALIDATION_ERROR", 400);
  const row = await ownedBooking(c.env.DB, c.req.param("id"), c.get("userId"));
  if (row.status !== "CONFIRMED") throw new ApiError("STATE_CONFLICT", 409);
  const { slots, terms } = await rescheduleSlots(
    c.env.DB,
    row,
    date,
    Date.now(),
  );
  return ok(c, {
    date,
    timezone: terms.timezone,
    slots: slots.filter((s) => s !== row.startsAt),
  });
});
bookingRoutes.post(
  "/bookings/:id/reschedule-requests",
  requireUser,
  async (c) => {
    const input = await body(
      c,
      z
        .object({
          expectedVersion: z.number().int().positive(),
          startsAt: z
            .number()
            .int()
            .positive()
            .max(8_000_000_000_000)
            .multipleOf(900_000),
        })
        .strict(),
    );
    const db = c.env.DB,
      user = c.get("userId"),
      id = c.req.param("id"),
      transaction = await receipt(c, `reschedule.create:${id}`, input);
    return transaction.respond(async () => {
      const replay = await transaction.replay();
      if (replay) return ok(c, replay);
      const row = await ownedBooking(db, id, user),
        now = Date.now(),
        terms = JSON.parse(row.terms) as BookingTerms;
      if (row.status !== "CONFIRMED" || row.version !== input.expectedVersion)
        throw new ApiError("STATE_CONFLICT", 409);
      const responder = row.ownerUser === user ? row.clientUser : row.ownerUser;
      if (
        !responder ||
        responder === user ||
        now >= row.startsAt ||
        (user !== row.ownerUser &&
          now > row.startsAt - terms.cancellationNoticeMinutes * 60_000)
      )
        throw new ApiError("POLICY_VIOLATION", 409);
      const { slots } = await rescheduleSlots(
        db,
        row,
        dateOf(input.startsAt, terms.timezone),
        now,
      );
      if (input.startsAt === row.startsAt || !slots.includes(input.startsAt))
        throw new ApiError("SLOT_UNAVAILABLE", 409);
      const proposal = crypto.randomUUID(),
        guard = crypto.randomUUID(),
        expires = Math.min(
          now + 86_400_000,
          row.startsAt,
          input.startsAt - 900_000,
        );
      if (expires <= now) throw new ApiError("POLICY_VIOLATION", 409);
      return ok(
        c,
        await transaction.commit(proposal, [
          db
            .prepare(
              `INSERT INTO transaction_guards (id,passed) VALUES (?,CASE WHEN EXISTS (SELECT 1 FROM bookings WHERE id=? AND version=? AND status='CONFIRMED') THEN 1 ELSE 0 END)`,
            )
            .bind(guard, id, row.version),
          // A newer proposal explicitly supersedes earlier unanswered proposals. Neither holds slots.
          db
            .prepare(
              "UPDATE reschedule_requests SET status=CASE WHEN expires_at<=? THEN 'EXPIRED' ELSE 'CANCELLED' END WHERE booking_id=? AND status='PENDING'",
            )
            .bind(now, id),
          db
            .prepare(
              "INSERT INTO reschedule_requests (id,booking_id,org_id,proposer_id,responder_id,booking_version,starts_at,status,expires_at,created_at) VALUES (?,?,?,?,?,?,?,'PENDING',?,?)",
            )
            .bind(
              proposal,
              id,
              row.orgId,
              user,
              responder,
              row.version,
              input.startsAt,
              expires,
              now,
            ),
          ...eventStatements(
            db,
            row.orgId,
            id,
            user,
            "booking.reschedule_proposed",
            {
              proposalId: proposal,
              startsAt: input.startsAt,
              expiresAt: expires,
            },
            now,
          ),
          db.prepare("DELETE FROM transaction_guards WHERE id=?").bind(guard),
        ]),
      );
    });
  },
);
for (const action of ["accept", "reject"] as const) {
  bookingRoutes.post(
    `/reschedule-requests/:id/${action}`,
    requireUser,
    async (c) => {
      await body(c, z.object({}).strict());
      const db = c.env.DB,
        user = c.get("userId"),
        proposalId = c.req.param("id"),
        transaction = await receipt(
          c,
          `reschedule.${action}:${proposalId}`,
          {},
        );
      return transaction.respond(async () => {
        const replay = await transaction.replay();
        if (replay) return ok(c, replay);
        const proposal = await db
          .prepare(
            "SELECT booking_id AS bookingId,starts_at AS startsAt,booking_version AS bookingVersion FROM reschedule_requests WHERE id=? AND responder_id=? AND status='PENDING' AND expires_at>?",
          )
          .bind(proposalId, user, Date.now())
          .first<{
            bookingId: string;
            startsAt: number;
            bookingVersion: number;
          }>();
        if (!proposal) throw new ApiError("STATE_CONFLICT", 409);
        const row = await ownedBooking(db, proposal.bookingId, user),
          now = Date.now();
        if (
          row.status !== "CONFIRMED" ||
          row.version !== proposal.bookingVersion ||
          now >= row.startsAt
        )
          throw new ApiError("STATE_CONFLICT", 409);
        const guard = crypto.randomUUID();
        const statements = [
          db
            .prepare(
              `INSERT INTO transaction_guards (id,passed) VALUES (?,CASE WHEN EXISTS (SELECT 1 FROM reschedule_requests p JOIN bookings b ON b.id=p.booking_id WHERE p.id=? AND p.responder_id=? AND p.status='PENDING' AND p.expires_at>? AND b.version=p.booking_version AND b.status='CONFIRMED') THEN 1 ELSE 0 END)`,
            )
            .bind(guard, proposalId, user, now),
        ];
        if (action === "accept") {
          const terms = JSON.parse(row.terms) as BookingTerms;
          const { slots, schedule } = await rescheduleSlots(
            db,
            row,
            dateOf(proposal.startsAt, terms.timezone),
            now,
          );
          if (!slots.includes(proposal.startsAt))
            throw new ApiError("SLOT_UNAVAILABLE", 409);
          statements.push(
            db
              .prepare(
                "INSERT INTO transaction_guards (id,passed) VALUES (?,CASE WHEN EXISTS (SELECT 1 FROM resources WHERE id=? AND revision=?) THEN 1 ELSE 0 END)",
              )
              .bind(guard + "-resource", terms.resourceId, schedule.revision),
            db
              .prepare(
                "UPDATE bookings SET starts_at=?,ends_at=?,version=version+1 WHERE id=?",
              )
              .bind(
                proposal.startsAt,
                proposal.startsAt + terms.durationMinutes * 60_000,
                row.id,
              ),
            db
              .prepare(
                "DELETE FROM booking_allocations WHERE booking_id=? AND org_id=?",
              )
              .bind(row.id, row.orgId),
            db
              .prepare(
                "INSERT INTO booking_allocations (org_id,booking_id,resource_id,slot_start_utc) SELECT ?,?,?,value FROM json_each(?)",
              )
              .bind(
                row.orgId,
                row.id,
                terms.resourceId,
                JSON.stringify(
                  allocationSlots(
                    proposal.startsAt,
                    terms.durationMinutes,
                    terms.bufferBeforeMinutes,
                    terms.bufferAfterMinutes,
                  ),
                ),
              ),
            db
              .prepare("DELETE FROM transaction_guards WHERE id=?")
              .bind(guard + "-resource"),
          );
        }
        statements.push(
          db
            .prepare("UPDATE reschedule_requests SET status=? WHERE id=?")
            .bind(action === "accept" ? "ACCEPTED" : "REJECTED", proposalId),
          ...eventStatements(
            db,
            row.orgId,
            row.id,
            user,
            action === "accept"
              ? "booking.rescheduled"
              : "booking.reschedule_rejected",
            {
              proposalId,
              previousStartsAt: row.startsAt,
              startsAt: proposal.startsAt,
            },
            now,
          ),
          db.prepare("DELETE FROM transaction_guards WHERE id=?").bind(guard),
        );
        return ok(c, await transaction.commit(row.id, statements));
      });
    },
  );
}

for (const [action, status, event] of [
  ["complete", "COMPLETED", "booking.completed"],
  ["no-show", "NO_SHOW", "booking.no_show"],
] as const) {
  bookingRoutes.post(`/bookings/:id/${action}`, requireUser, async (c) => {
    const input = await body(
        c,
        z.object({ expectedVersion: z.number().int().positive() }).strict(),
      ),
      db = c.env.DB,
      user = c.get("userId"),
      id = c.req.param("id"),
      transaction = await receipt(c, `booking.${action}:${id}`, input);
    return transaction.respond(async () => {
      const replay = await transaction.replay();
      if (replay) return ok(c, replay);
      const row = await ownedBooking(db, id, user),
        now = Date.now();
      if (row.ownerUser !== user) throw new ApiError("FORBIDDEN", 403);
      if (
        row.status !== "CONFIRMED" ||
        row.version !== input.expectedVersion ||
        row.endsAt > now
      )
        throw new ApiError("STATE_CONFLICT", 409);
      const guard = crypto.randomUUID();
      return ok(
        c,
        await transaction.commit(id, [
          db
            .prepare(
              "INSERT INTO transaction_guards (id,passed) VALUES (?,CASE WHEN EXISTS (SELECT 1 FROM bookings b JOIN organizations o ON o.id=b.org_id WHERE b.id=? AND b.version=? AND b.status='CONFIRMED' AND b.ends_at<=? AND o.owner_user_id=? AND o.status='ACTIVE') THEN 1 ELSE 0 END)",
            )
            .bind(guard, id, input.expectedVersion, now, user),
          db
            .prepare(
              "UPDATE bookings SET status=?,version=version+1 WHERE id=?",
            )
            .bind(status, id),
          db
            .prepare(
              "UPDATE reschedule_requests SET status='CANCELLED' WHERE booking_id=? AND status='PENDING'",
            )
            .bind(id),
          ...eventStatements(db, row.orgId, id, user, event, {}, now),
          db.prepare("DELETE FROM transaction_guards WHERE id=?").bind(guard),
        ]),
      );
    });
  });
}
