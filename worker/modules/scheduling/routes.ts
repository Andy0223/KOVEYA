import { Hono } from "hono";
import { z } from "zod";
import type { Environment } from "../../environment";
import { ApiError, body, ok } from "../../http";
import { timezone } from "../../validation";
import { requireUser } from "../identity/session";
import { ownedBusiness } from "../business/routes";
import { validDate } from "./availability";
import { bookableService, readSchedule, slotsFor } from "./repository";

export const schedulingRoutes = new Hono<Environment>();
const interval = z
  .object({
    start: z.number().int().min(0).max(1425).multipleOf(15),
    end: z.number().int().min(15).max(1440).multipleOf(15),
  })
  .strict()
  .refine((v) => v.start < v.end);
const date = z.string().refine(validDate);
const scheduleInput = z
  .object({
    expectedRevision: z.number().int().positive(),
    timezone,
    rules: z
      .array(interval.safeExtend({ weekday: z.number().int().min(0).max(6) }))
      .max(28),
    exceptions: z
      .array(z.object({ date, intervals: z.array(interval).max(4) }).strict())
      .max(60),
  })
  .strict()
  .superRefine((v, ctx) => {
    const groups = Array.from({ length: 7 }, (_, day) =>
      v.rules.filter((r) => r.weekday === day),
    );
    for (const group of [...groups, ...v.exceptions.map((e) => e.intervals)]) {
      const sorted = [...group].sort((a, b) => a.start - b.start);
      if (sorted.some((r, i) => i > 0 && r.start < sorted[i - 1]!.end))
        ctx.addIssue({ code: "custom", message: "Overlapping intervals" });
    }
    if (new Set(v.exceptions.map((e) => e.date)).size !== v.exceptions.length)
      ctx.addIssue({ code: "custom", message: "Duplicate dates" });
  });
async function ownedResource(db: D1Database, user: string) {
  const business = await ownedBusiness(db, user);
  if (!business) throw new ApiError("BUSINESS_REQUIRED", 409);
  const resource = await db
    .prepare("SELECT id FROM resources WHERE org_id=? ORDER BY id LIMIT 1")
    .bind(business.id)
    .first<{ id: string }>();
  if (!resource) throw new ApiError("NOT_FOUND", 404);
  return { orgId: business.id, resourceId: resource.id };
}
schedulingRoutes.get("/business/availability", requireUser, async (c) => {
  const owned = await ownedResource(c.env.DB, c.get("userId"));
  return ok(c, await readSchedule(c.env.DB, owned.resourceId));
});
schedulingRoutes.put("/business/availability", requireUser, async (c) => {
  const input = await body(c, scheduleInput),
    db = c.env.DB,
    user = c.get("userId");
  const { orgId, resourceId } = await ownedResource(db, user),
    guard = crypto.randomUUID();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO transaction_guards (id,passed) VALUES (?, CASE WHEN EXISTS
        (SELECT 1 FROM resources r JOIN organizations o ON o.id=r.org_id WHERE r.id=? AND r.revision=? AND o.owner_user_id=? AND o.status='ACTIVE') THEN 1 ELSE 0 END)`,
        )
        .bind(guard, resourceId, input.expectedRevision, user),
      db
        .prepare(
          "UPDATE resources SET timezone=?, revision=revision+1 WHERE id=?",
        )
        .bind(input.timezone, resourceId),
      db
        .prepare("DELETE FROM availability_rules WHERE resource_id=?")
        .bind(resourceId),
      db
        .prepare("DELETE FROM availability_exceptions WHERE resource_id=?")
        .bind(resourceId),
      db
        .prepare(
          "INSERT INTO availability_rules (id,org_id,resource_id,weekday,start_local_minute,end_local_minute) SELECT json_extract(value,'$.id'),?,?,json_extract(value,'$.weekday'),json_extract(value,'$.start'),json_extract(value,'$.end') FROM json_each(?)",
        )
        .bind(
          orgId,
          resourceId,
          JSON.stringify(
            input.rules.map((r) => ({ ...r, id: crypto.randomUUID() })),
          ),
        ),
      db
        .prepare(
          "INSERT INTO availability_exceptions (id,org_id,resource_id,date,intervals) SELECT json_extract(value,'$.id'),?,?,json_extract(value,'$.date'),json_extract(value,'$.intervals') FROM json_each(?)",
        )
        .bind(
          orgId,
          resourceId,
          JSON.stringify(
            input.exceptions.map((e) => ({ ...e, id: crypto.randomUUID() })),
          ),
        ),
      db
        .prepare(
          "INSERT INTO audit_logs (id,actor_id,org_id,action,entity_id,created_at) VALUES (?,?,?,'availability.updated',?,?)",
        )
        .bind(crypto.randomUUID(), user, orgId, resourceId, Date.now()),
      db.prepare("DELETE FROM transaction_guards WHERE id=?").bind(guard),
    ]);
  } catch (error) {
    if (String(error).includes("transaction_guard_check"))
      throw new ApiError("STATE_CONFLICT", 409);
    throw error;
  }
  return ok(c, { revision: input.expectedRevision + 1 });
});
schedulingRoutes.get("/services/:id/availability", async (c) => {
  const query = z
    .object({ date, offeringId: z.string().min(1).max(100) })
    .strict()
    .safeParse(c.req.query());
  if (!query.success) throw new ApiError("VALIDATION_ERROR", 400);
  const service = await bookableService(
    c.env.DB,
    c.req.param("id"),
    query.data.offeringId,
  );
  if (service.mode !== "INSTANT" || service.pricingType === "QUOTE")
    return ok(c, {
      date: query.data.date,
      timezone: service.timezone,
      slots: [],
    });
  const { slots } = await slotsFor(c.env.DB, service, query.data.date);
  return ok(c, { date: query.data.date, timezone: service.timezone, slots });
});
