import { Hono } from "hono";
import { z } from "zod";
import type { Environment } from "../../environment";
import { ApiError, body, ok } from "../../http";
import { profileInput, serviceInput, serviceEditInput } from "../../validation";
import { requireUser } from "../identity/session";

export const businessRoutes = new Hono<Environment>();
for (const path of [
  "/business/*",
  "/organizations",
  "/organizations/*",
  "/services",
  "/services/*",
])
  businessRoutes.use(path, requireUser);

async function ownedBusiness(db: D1Database, userId: string) {
  return db
    .prepare(
      `SELECT o.id, p.public_name AS publicName, p.slug, p.bio, p.location_label AS locationLabel, p.timezone, p.published
    FROM organizations o JOIN organization_members m ON m.org_id = o.id AND m.user_id = ? AND m.role = 'OWNER'
    JOIN provider_profiles p ON p.org_id = o.id WHERE o.status = 'ACTIVE' AND o.owner_user_id = ?`,
    )
    .bind(userId, userId)
    .first<{
      id: string;
      publicName: string;
      slug: string;
      bio: string;
      locationLabel: string;
      timezone: string;
      published: number;
    }>();
}

businessRoutes.get("/business/profile", async (c) => {
  const business = await ownedBusiness(c.env.DB, c.get("userId"));
  return ok(
    c,
    business ? { ...business, published: business.published === 1 } : null,
  );
});

businessRoutes.post("/organizations", async (c) => {
  const input = await body(c, profileInput),
    db = c.env.DB;
  if (await ownedBusiness(db, c.get("userId")))
    throw new ApiError("BUSINESS_EXISTS", 409);
  const id = crypto.randomUUID();
  try {
    await db.batch([
      db
        .prepare(
          `INSERT INTO organizations (id, owner_user_id, name, status, created_at) VALUES (?, ?, ?, 'ACTIVE', ?)`,
        )
        .bind(id, c.get("userId"), input.publicName, Date.now()),
      db
        .prepare(
          `INSERT INTO organization_members (org_id, user_id, role) VALUES (?, ?, 'OWNER')`,
        )
        .bind(id, c.get("userId")),
      db
        .prepare(
          `INSERT INTO provider_profiles (id, org_id, public_name, slug, bio, location_label, timezone, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          input.publicName,
          input.slug,
          input.bio,
          input.locationLabel,
          input.timezone,
          Number(input.published),
        ),
      db
        .prepare(
          `INSERT INTO resources (id, org_id, name, timezone) VALUES (?, ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), id, input.publicName, input.timezone),
      db
        .prepare(
          `INSERT INTO audit_logs (id, actor_id, org_id, action, entity_id, created_at) VALUES (?, ?, ?, 'provider.created', ?, ?)`,
        )
        .bind(crypto.randomUUID(), c.get("userId"), id, id, Date.now()),
    ]);
  } catch (error) {
    if (String(error).includes("UNIQUE"))
      throw new ApiError("BUSINESS_CONFLICT", 409);
    throw error;
  }
  return ok(c, { id, slug: input.slug });
});

businessRoutes.patch("/organizations/:id", async (c) => {
  const input = await body(c, profileInput),
    db = c.env.DB;
  const owned = await ownedBusiness(db, c.get("userId"));
  if (!owned || owned.id !== c.req.param("id"))
    throw new ApiError("NOT_FOUND", 404);
  if (input.slug !== owned.slug) throw new ApiError("SLUG_IMMUTABLE", 409);
  await db.batch([
    db
      .prepare(
        "UPDATE organizations SET name = ? WHERE id = ? AND owner_user_id = ?",
      )
      .bind(input.publicName, owned.id, c.get("userId")),
    db
      .prepare(
        `UPDATE provider_profiles SET public_name = ?, bio = ?, location_label = ?, timezone = ?, published = ? WHERE org_id = ?`,
      )
      .bind(
        input.publicName,
        input.bio,
        input.locationLabel,
        input.timezone,
        Number(input.published),
        owned.id,
      ),
    db
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, org_id, action, entity_id, created_at) VALUES (?, ?, ?, 'provider.updated', ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        c.get("userId"),
        owned.id,
        owned.id,
        Date.now(),
      ),
  ]);
  return ok(c, { updated: true });
});

businessRoutes.get("/business/services", async (c) => {
  const business = await ownedBusiness(c.env.DB, c.get("userId"));
  if (!business) return ok(c, []);
  const result = await c.env.DB.prepare(
    `SELECT s.id, s.revision, s.name, s.description, s.mode, s.status, s.delivery,
    s.location_label AS locationLabel, s.timezone, s.cancellation_notice_minutes AS cancellationNoticeMinutes,
    s.cancellation_policy AS cancellationPolicy, s.policy_version AS policyVersion, s.min_notice_minutes AS minNoticeMinutes,
    s.max_advance_days AS maxAdvanceDays, s.buffer_before_minutes AS bufferBeforeMinutes, s.buffer_after_minutes AS bufferAfterMinutes,
    o.id AS offeringId, o.duration_minutes AS durationMinutes, o.pricing_type AS pricingType, o.price_minor AS priceMinor, o.currency
    FROM services s JOIN offerings o ON o.service_id = s.id AND o.org_id = s.org_id WHERE s.org_id = ? ORDER BY s.rowid DESC`,
  )
    .bind(business.id)
    .all();
  return ok(c, result.results);
});

businessRoutes.post("/services", async (c) => {
  const input = await body(c, serviceInput),
    db = c.env.DB;
  const business = await ownedBusiness(db, c.get("userId"));
  if (!business) throw new ApiError("BUSINESS_REQUIRED", 409);
  const id = crypto.randomUUID(),
    offeringId = crypto.randomUUID();
  await db.batch([
    db
      .prepare(
        `INSERT INTO services (id, org_id, name, description, mode, status, delivery, location_label, timezone,
      cancellation_notice_minutes, cancellation_policy, min_notice_minutes, max_advance_days, buffer_before_minutes, buffer_after_minutes)
      VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        business.id,
        input.name,
        input.description,
        input.mode,
        input.delivery,
        input.locationLabel,
        input.timezone,
        input.cancellationNoticeMinutes,
        input.cancellationPolicy,
        input.minNoticeMinutes,
        input.maxAdvanceDays,
        input.bufferBeforeMinutes,
        input.bufferAfterMinutes,
      ),
    db
      .prepare(
        `INSERT INTO offerings (id, service_id, org_id, duration_minutes, pricing_type, price_minor, currency) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        offeringId,
        id,
        business.id,
        input.durationMinutes,
        input.pricingType,
        input.priceMinor,
        input.currency,
      ),
    db
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, org_id, action, entity_id, created_at) VALUES (?, ?, ?, 'service.created', ?, ?)`,
      )
      .bind(crypto.randomUUID(), c.get("userId"), business.id, id, Date.now()),
  ]);
  return ok(c, { id, offeringId, revision: 1 });
});

businessRoutes.patch("/services/:id", async (c) => {
  const input = await body(c, serviceEditInput),
    db = c.env.DB;
  const business = await ownedBusiness(db, c.get("userId"));
  if (!business) throw new ApiError("NOT_FOUND", 404);
  const id = c.req.param("id"),
    nonce = crypto.randomUUID();
  const results = await db.batch([
    db
      .prepare(
        `UPDATE services SET name = ?, description = ?, mode = ?, delivery = ?, location_label = ?, timezone = ?,
      policy_version = policy_version + CASE WHEN cancellation_policy <> ? OR cancellation_notice_minutes <> ? THEN 1 ELSE 0 END,
      cancellation_notice_minutes = ?, cancellation_policy = ?, min_notice_minutes = ?, max_advance_days = ?, buffer_before_minutes = ?, buffer_after_minutes = ?,
      revision = revision + 1, last_mutation_id = ? WHERE id = ? AND org_id = ? AND revision = ? AND status <> 'ARCHIVED'`,
      )
      .bind(
        input.name,
        input.description,
        input.mode,
        input.delivery,
        input.locationLabel,
        input.timezone,
        input.cancellationPolicy,
        input.cancellationNoticeMinutes,
        input.cancellationNoticeMinutes,
        input.cancellationPolicy,
        input.minNoticeMinutes,
        input.maxAdvanceDays,
        input.bufferBeforeMinutes,
        input.bufferAfterMinutes,
        nonce,
        id,
        business.id,
        input.expectedRevision,
      ),
    db
      .prepare(
        `UPDATE offerings SET duration_minutes = ?, pricing_type = ?, price_minor = ?, currency = ? WHERE service_id = ? AND org_id = ?
      AND EXISTS (SELECT 1 FROM services WHERE id = ? AND org_id = ? AND last_mutation_id = ?)`,
      )
      .bind(
        input.durationMinutes,
        input.pricingType,
        input.priceMinor,
        input.currency,
        id,
        business.id,
        id,
        business.id,
        nonce,
      ),
    db
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, org_id, action, entity_id, created_at)
      SELECT ?, ?, org_id, 'service.updated', id, ? FROM services WHERE id = ? AND org_id = ? AND last_mutation_id = ?`,
      )
      .bind(
        crypto.randomUUID(),
        c.get("userId"),
        Date.now(),
        id,
        business.id,
        nonce,
      ),
  ]);
  if (results[0]?.meta.changes !== 1) {
    const exists = await db
      .prepare("SELECT id FROM services WHERE id = ? AND org_id = ?")
      .bind(id, business.id)
      .first();
    throw new ApiError(
      exists ? "STATE_CONFLICT" : "NOT_FOUND",
      exists ? 409 : 404,
    );
  }
  return ok(c, { updated: true, revision: input.expectedRevision + 1 });
});

for (const action of ["publish", "unpublish"] as const) {
  businessRoutes.post(`/services/:id/${action}`, async (c) => {
    const input = await body(
      c,
      z.object({ expectedRevision: z.number().int().positive() }).strict(),
    );
    const db = c.env.DB,
      business = await ownedBusiness(db, c.get("userId"));
    if (!business) throw new ApiError("NOT_FOUND", 404);
    if (action === "publish" && !business.published)
      throw new ApiError("PROFILE_UNPUBLISHED", 409);
    const nonce = crypto.randomUUID(),
      id = c.req.param("id");
    const results = await db.batch([
      db
        .prepare(
          `UPDATE services SET status = ?, revision = revision + 1, last_mutation_id = ? WHERE id = ? AND org_id = ? AND revision = ? AND status IN ('DRAFT','PUBLISHED','UNPUBLISHED')`,
        )
        .bind(
          action === "publish" ? "PUBLISHED" : "UNPUBLISHED",
          nonce,
          id,
          business.id,
          input.expectedRevision,
        ),
      db
        .prepare(
          `INSERT INTO audit_logs (id, actor_id, org_id, action, entity_id, created_at)
        SELECT ?, ?, org_id, ?, id, ? FROM services WHERE id = ? AND org_id = ? AND last_mutation_id = ?`,
        )
        .bind(
          crypto.randomUUID(),
          c.get("userId"),
          `service.${action === "publish" ? "published" : "unpublished"}`,
          Date.now(),
          id,
          business.id,
          nonce,
        ),
    ]);
    if (results[0]?.meta.changes !== 1) {
      const exists = await db
        .prepare("SELECT id FROM services WHERE id = ? AND org_id = ?")
        .bind(id, business.id)
        .first();
      throw new ApiError(
        exists ? "STATE_CONFLICT" : "NOT_FOUND",
        exists ? 409 : 404,
      );
    }
    return ok(c, { updated: true, revision: input.expectedRevision + 1 });
  });
}
