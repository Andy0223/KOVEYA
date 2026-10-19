import { Hono } from "hono";
import { z } from "zod";
import type { Environment } from "../../environment";
import { ApiError, body, ok } from "../../http";
import { requireUser } from "../identity/session";
import { businessId } from "./routes";
import { validDate } from "../scheduling/availability";
import { bookableService, dateOf, slotsFor } from "../scheduling/repository";
import { bookingStatements, termsFor } from "../scheduling/booking-write";
import { eventStatements, receipt } from "../scheduling/transactions";
import { ownedBooking, rescheduleSlots } from "../scheduling/bookings";
import { allocationSlots } from "../scheduling/slots";

export const manualRoutes = new Hono<Environment>();
manualRoutes.get(
  "/business/services/:id/availability",
  requireUser,
  async (c) => {
    const query = z
      .object({
        date: z.string().refine(validDate),
        offeringId: z.string().min(1).max(100),
      })
      .strict()
      .safeParse(c.req.query());
    if (!query.success) throw new ApiError("VALIDATION_ERROR", 400);
    const org = await businessId(c.env.DB, c.get("userId")),
      service = await bookableService(
        c.env.DB,
        c.req.param("id"),
        query.data.offeringId,
        org,
      );
    const { slots } = await slotsFor(
      c.env.DB,
      { ...service, minNoticeMinutes: 0 },
      query.data.date,
    );
    return ok(c, {
      date: query.data.date,
      timezone: service.timezone,
      slots: service.priceMinor === null ? [] : slots,
    });
  },
);
const start = z
  .number()
  .int()
  .positive()
  .max(8_000_000_000_000)
  .multipleOf(900_000);
manualRoutes.post("/business/bookings", requireUser, async (c) => {
  const input = await body(
      c,
      z
        .object({
          clientId: z.string().min(1).max(100),
          serviceId: z.string().min(1).max(100),
          offeringId: z.string().min(1).max(100),
          startsAt: start,
          expectedServiceRevision: z.number().int().positive(),
          confirmedWithClient: z.literal(true),
        })
        .strict(),
    ),
    db = c.env.DB,
    user = c.get("userId"),
    tx = await receipt(c, "booking.manual", input);
  return tx.respond(async () => {
    const replay = await tx.replay();
    if (replay) return ok(c, replay);
    const org = await businessId(db, user),
      client = await db
        .prepare(
          "SELECT user_id AS userId FROM client_relationships WHERE id=? AND org_id=?",
        )
        .bind(input.clientId, org)
        .first<{ userId: string | null }>();
    if (!client) throw new ApiError("NOT_FOUND", 404);
    const service = await bookableService(
      db,
      input.serviceId,
      input.offeringId,
      org,
    );
    if (service.revision !== input.expectedServiceRevision)
      throw new ApiError("STATE_CONFLICT", 409);
    if (service.priceMinor === null)
      throw new ApiError("POLICY_VIOLATION", 409);
    const now = Date.now(),
      { slots, schedule } = await slotsFor(
        db,
        { ...service, minNoticeMinutes: 0 },
        dateOf(input.startsAt, service.timezone),
        now,
      );
    if (!slots.includes(input.startsAt))
      throw new ApiError("SLOT_UNAVAILABLE", 409);
    const id = crypto.randomUUID(),
      g = crypto.randomUUID(),
      terms = {
        ...termsFor(service, now),
        consentSource: "PROVIDER_REPORTED" as const,
      };
    return ok(
      c,
      await tx.commit(id, [
        db
          .prepare(
            `INSERT INTO transaction_guards (id,passed) VALUES (?,CASE WHEN EXISTS (
        SELECT 1 FROM services s JOIN organizations o ON o.id=s.org_id AND o.status='ACTIVE' AND o.owner_user_id=?
        JOIN organization_members m ON m.org_id=o.id AND m.user_id=o.owner_user_id AND m.role='OWNER'
        JOIN service_resources sr ON sr.service_id=s.id AND sr.org_id=s.org_id JOIN resources r ON r.id=sr.resource_id AND r.org_id=s.org_id
        JOIN client_relationships c ON c.id=? AND c.org_id=s.org_id
        WHERE s.id=? AND s.revision=? AND s.status='PUBLISHED' AND r.id=? AND r.revision=?
        AND (c.user_id IS NULL OR EXISTS (SELECT 1 FROM users WHERE id=c.user_id AND status='ACTIVE'))) THEN 1 ELSE 0 END)`,
          )
          .bind(
            g,
            user,
            input.clientId,
            service.id,
            service.revision,
            service.resourceId,
            schedule.revision,
          ),
        ...bookingStatements(
          db,
          id,
          org,
          service.offeringId,
          client.userId ?? "",
          user,
          input.startsAt,
          terms,
          now,
          input.clientId,
        ),
        db.prepare("DELETE FROM transaction_guards WHERE id=?").bind(g),
      ]),
    );
  });
});
manualRoutes.post("/bookings/:id/manual-reschedule", requireUser, async (c) => {
  const input = await body(
      c,
      z
        .object({
          expectedVersion: z.number().int().positive(),
          startsAt: start,
          confirmedWithClient: z.literal(true),
          reason: z.string().trim().min(1).max(500),
        })
        .strict(),
    ),
    db = c.env.DB,
    user = c.get("userId"),
    id = c.req.param("id"),
    tx = await receipt(c, `booking.manual-reschedule:${id}`, input);
  return tx.respond(async () => {
    const replay = await tx.replay();
    if (replay) return ok(c, replay);
    const row = await ownedBooking(db, id, user);
    if (row.ownerUser !== user) throw new ApiError("FORBIDDEN", 403);
    if (row.source !== "PROVIDER_RECORDED" || row.clientUser !== null)
      throw new ApiError("POLICY_VIOLATION", 409);
    const now = Date.now();
    if (
      row.status !== "CONFIRMED" ||
      row.version !== input.expectedVersion ||
      row.startsAt <= now
    )
      throw new ApiError("STATE_CONFLICT", 409);
    const { terms, schedule, slots } = await rescheduleSlots(
      db,
      row,
      dateOf(
        input.startsAt,
        (JSON.parse(row.terms) as { timezone: string }).timezone,
      ),
      now,
    );
    if (input.startsAt === row.startsAt || !slots.includes(input.startsAt))
      throw new ApiError("SLOT_UNAVAILABLE", 409);
    const g = crypto.randomUUID();
    return ok(
      c,
      await tx.commit(id, [
        db
          .prepare(
            `INSERT INTO transaction_guards (id,passed) VALUES (?,CASE WHEN EXISTS (SELECT 1 FROM bookings b JOIN client_relationships c ON c.id=b.client_id AND c.org_id=b.org_id JOIN organizations o ON o.id=b.org_id AND o.owner_user_id=? AND o.status='ACTIVE' JOIN organization_members m ON m.org_id=o.id AND m.user_id=o.owner_user_id AND m.role='OWNER' JOIN resources r ON r.id=? AND r.org_id=b.org_id WHERE b.id=? AND b.version=? AND b.status='CONFIRMED' AND b.source='PROVIDER_RECORDED' AND c.user_id IS NULL AND r.revision=?) THEN 1 ELSE 0 END)`,
          )
          .bind(
            g,
            user,
            terms.resourceId,
            id,
            input.expectedVersion,
            schedule.revision,
          ),
        db
          .prepare(
            "UPDATE bookings SET starts_at=?,ends_at=?,version=version+1 WHERE id=?",
          )
          .bind(
            input.startsAt,
            input.startsAt + terms.durationMinutes * 60_000,
            id,
          ),
        db
          .prepare(
            "DELETE FROM booking_allocations WHERE booking_id=? AND org_id=?",
          )
          .bind(id, row.orgId),
        db
          .prepare(
            "INSERT INTO booking_allocations (org_id,booking_id,resource_id,slot_start_utc) SELECT ?,?,?,value FROM json_each(?)",
          )
          .bind(
            row.orgId,
            id,
            terms.resourceId,
            JSON.stringify(
              allocationSlots(
                input.startsAt,
                terms.durationMinutes,
                terms.bufferBeforeMinutes,
                terms.bufferAfterMinutes,
              ),
            ),
          ),
        ...eventStatements(
          db,
          row.orgId,
          id,
          user,
          "booking.rescheduled",
          {
            previousStartsAt: row.startsAt,
            startsAt: input.startsAt,
            reason: input.reason,
            consentSource: "PROVIDER_REPORTED",
          },
          now,
        ),
        db.prepare("DELETE FROM transaction_guards WHERE id=?").bind(g),
      ]),
    );
  });
});
