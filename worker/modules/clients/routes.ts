import { Hono } from "hono";
import { z } from "zod";
import type { Environment } from "../../environment";
import type { Client } from "../../../src/shared/clients";
import { ApiError, body, ok } from "../../http";
import { requireUser } from "../identity/session";
import { ownedBusiness } from "../business/routes";
import {
  bookingDto,
  selectBooking,
  type BookingRow,
} from "../scheduling/bookings";
import { receipt } from "../scheduling/transactions";

export const clientRoutes = new Hono<Environment>();
const clean = z
  .string()
  .trim()
  .refine((v) => !/[\u0000-\u001f\u007f]/.test(v));
const contact = z
  .object({
    name: clean.pipe(z.string().min(1).max(120)),
    email: z.preprocess(
      (v) => (typeof v === "string" ? v.trim().toLowerCase() || null : v),
      z.email().max(254).nullable().default(null),
    ),
    phone: z.preprocess(
      (v) => (typeof v === "string" ? v.trim() || null : v),
      z
        .string()
        .max(40)
        .regex(/^[+0-9(). xX-]+$/)
        .nullable()
        .default(null),
    ),
  })
  .strict();
const page = z.coerce.number().int().min(0).max(1_000_000).default(0);
interface Row extends Omit<Client, "linkedAccount"> {
  linkedAccount: number;
}
const selectClient = `SELECT c.id,c.name,c.email,c.phone,c.user_id IS NOT NULL AS linkedAccount,c.revision,c.created_at AS createdAt,c.updated_at AS updatedAt,
  (SELECT COUNT(*) FROM bookings b WHERE b.client_id=c.id AND b.org_id=c.org_id) AS bookingCount,
  (SELECT COUNT(*) FROM bookings b WHERE b.client_id=c.id AND b.org_id=c.org_id AND b.status='COMPLETED') AS completedCount,
  (SELECT MAX(b.starts_at) FROM bookings b WHERE b.client_id=c.id AND b.org_id=c.org_id AND b.status='COMPLETED') AS lastServiceAt,
  (SELECT MIN(b.starts_at) FROM bookings b WHERE b.client_id=c.id AND b.org_id=c.org_id AND b.status='CONFIRMED' AND b.starts_at>=?) AS nextBookingAt
  FROM client_relationships c`;
const dto = (r: Row): Client => ({
  ...r,
  linkedAccount: r.linkedAccount === 1,
});
export async function businessId(db: D1Database, user: string) {
  const org = await ownedBusiness(db, user);
  if (!org) throw new ApiError("BUSINESS_REQUIRED", 409);
  return org.id;
}
clientRoutes.get("/clients", requireUser, async (c) => {
  const query = z
    .object({ q: clean.pipe(z.string().max(80)).default(""), offset: page })
    .strict()
    .safeParse(c.req.query());
  if (!query.success) throw new ApiError("VALIDATION_ERROR", 400);
  const db = c.env.DB,
    org = await businessId(db, c.get("userId")),
    q = `%${query.data.q.replace(/[\\%_]/g, "\\$&")}%`;
  const filter =
    " WHERE c.org_id=? AND (c.name LIKE ? ESCAPE '\\' OR c.email LIKE ? ESCAPE '\\' OR c.phone LIKE ? ESCAPE '\\')";
  const rows = await db
    .prepare(
      selectClient +
        filter +
        " ORDER BY c.name COLLATE NOCASE,c.id LIMIT 50 OFFSET ?",
    )
    .bind(Date.now(), org, q, q, q, query.data.offset)
    .all<Row>();
  const total = await db
    .prepare("SELECT COUNT(*) AS n FROM client_relationships c" + filter)
    .bind(org, q, q, q)
    .first<{ n: number }>();
  return ok(c, {
    items: rows.results.map(dto),
    total: total?.n ?? 0,
    offset: query.data.offset,
    limit: 50,
  });
});
clientRoutes.get("/clients/:id", requireUser, async (c) => {
  const query = z.object({ offset: page }).strict().safeParse(c.req.query());
  if (!query.success) throw new ApiError("VALIDATION_ERROR", 400);
  const db = c.env.DB,
    user = c.get("userId"),
    org = await businessId(db, user),
    id = c.req.param("id");
  const client = await db
    .prepare(selectClient + " WHERE c.id=? AND c.org_id=?")
    .bind(Date.now(), id, org)
    .first<Row>();
  if (!client) throw new ApiError("NOT_FOUND", 404);
  const bookings = await db
    .prepare(
      selectBooking +
        " WHERE b.client_id=? AND b.org_id=? ORDER BY b.starts_at DESC,b.id LIMIT 50 OFFSET ?",
    )
    .bind(id, org, query.data.offset)
    .all<BookingRow>();
  return ok(c, {
    client: dto(client),
    bookings: bookings.results.map((r) => bookingDto(r, user)),
    totalBookings: client.bookingCount,
    offset: query.data.offset,
    limit: 50,
  });
});
clientRoutes.post("/clients", requireUser, async (c) => {
  const input = await body(c, contact),
    db = c.env.DB,
    user = c.get("userId"),
    tx = await receipt(c, "client.create", input);
  return tx.respond(async () => {
    const replay = await tx.replay();
    if (replay) return ok(c, replay);
    const org = await businessId(db, user),
      id = crypto.randomUUID(),
      g = crypto.randomUUID(),
      now = Date.now();
    return ok(
      c,
      await tx.commit(id, [
        db
          .prepare(
            "INSERT INTO transaction_guards (id,passed) VALUES (?,CASE WHEN EXISTS (SELECT 1 FROM organizations o JOIN organization_members m ON m.org_id=o.id AND m.user_id=? AND m.role='OWNER' WHERE o.id=? AND o.owner_user_id=? AND o.status='ACTIVE') THEN 1 ELSE 0 END)",
          )
          .bind(g, user, org, user),
        // Contact email never grants access to a platform identity.
        db
          .prepare(
            "INSERT INTO client_relationships (id,org_id,name,email,phone,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
          )
          .bind(id, org, input.name, input.email, input.phone, now, now),
        db
          .prepare(
            "INSERT INTO audit_logs (id,actor_id,org_id,action,entity_id,created_at) VALUES (?,?,?,'client.created',?,?)",
          )
          .bind(crypto.randomUUID(), user, org, id, now),
        db.prepare("DELETE FROM transaction_guards WHERE id=?").bind(g),
      ]),
    );
  });
});
clientRoutes.patch("/clients/:id", requireUser, async (c) => {
  const input = await body(
      c,
      contact.extend({ expectedRevision: z.number().int().positive() }),
    ),
    db = c.env.DB,
    user = c.get("userId"),
    org = await businessId(db, user),
    id = c.req.param("id"),
    g = crypto.randomUUID();
  const client = await db
    .prepare(
      "SELECT revision FROM client_relationships WHERE id=? AND org_id=?",
    )
    .bind(id, org)
    .first<{ revision: number }>();
  if (!client) throw new ApiError("NOT_FOUND", 404);
  try {
    await db.batch([
      db
        .prepare(
          "INSERT INTO transaction_guards (id,passed) VALUES (?,CASE WHEN EXISTS (SELECT 1 FROM client_relationships c JOIN organizations o ON o.id=c.org_id JOIN organization_members m ON m.org_id=o.id AND m.user_id=? AND m.role='OWNER' WHERE c.id=? AND c.org_id=? AND c.revision=? AND o.owner_user_id=? AND o.status='ACTIVE') THEN 1 ELSE 0 END)",
        )
        .bind(g, user, id, org, input.expectedRevision, user),
      db
        .prepare(
          "UPDATE client_relationships SET name=?,email=?,phone=?,revision=revision+1,updated_at=? WHERE id=? AND org_id=?",
        )
        .bind(input.name, input.email, input.phone, Date.now(), id, org),
      db
        .prepare(
          "INSERT INTO audit_logs (id,actor_id,org_id,action,entity_id,created_at) VALUES (?,?,?,'client.updated',?,?)",
        )
        .bind(crypto.randomUUID(), user, org, id, Date.now()),
      db.prepare("DELETE FROM transaction_guards WHERE id=?").bind(g),
    ]);
  } catch (error) {
    if (String(error).includes("transaction_guard_check"))
      throw new ApiError("STATE_CONFLICT", 409);
    throw error;
  }
  return ok(c, { revision: input.expectedRevision + 1 });
});
clientRoutes.get("/my-providers", requireUser, async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT p.public_name AS publicName,p.slug,p.location_label AS locationLabel,p.timezone,COUNT(*) AS bookingCount,MAX(b.starts_at) AS lastBookingAt
    FROM bookings b JOIN client_relationships c ON c.id=b.client_id AND c.org_id=b.org_id
    JOIN organizations o ON o.id=b.org_id AND o.status='ACTIVE' JOIN provider_profiles p ON p.org_id=o.id AND p.published=1
    WHERE c.user_id=? GROUP BY p.id ORDER BY lastBookingAt DESC,p.slug LIMIT 100`,
  )
    .bind(c.get("userId"))
    .all();
  return ok(c, rows.results);
});
