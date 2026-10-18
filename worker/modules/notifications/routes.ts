import { Hono } from "hono";
import { z } from "zod";
import type { Environment } from "../../environment";
import { ApiError, body, ok } from "../../http";
import { requireUser } from "../identity/session";
import { maintenance } from "./jobs";
export const notificationRoutes = new Hono<Environment>();
notificationRoutes.get("/notifications", requireUser, async (c) => {
  // Also drain a bounded batch locally, where scheduled triggers are not automatically invoked.
  await maintenance(c.env.DB);
  const rows = await c.env.DB.prepare(
    "SELECT id,event_type AS eventType,entity_type AS entityType,entity_id AS entityId,created_at AS createdAt,read_at AS readAt FROM notifications WHERE recipient_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100",
  )
    .bind(c.get("userId"))
    .all();
  const unread = await c.env.DB.prepare(
    "SELECT COUNT(*) AS count FROM notifications WHERE recipient_id=? AND read_at IS NULL",
  )
    .bind(c.get("userId"))
    .first<{ count: number }>();
  return ok(c, { items: rows.results, unread: unread?.count ?? 0 });
});
notificationRoutes.post("/notifications/:id/read", requireUser, async (c) => {
  await body(c, z.object({}).strict());
  const result = await c.env.DB.prepare(
    "UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE id=? AND recipient_id=?",
  )
    .bind(Date.now(), c.req.param("id"), c.get("userId"))
    .run();
  if (result.meta.changes !== 1) throw new ApiError("NOT_FOUND", 404);
  return ok(c, { read: true });
});
