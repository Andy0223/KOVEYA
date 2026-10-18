import type { Context } from "hono";
import type { Environment } from "../../environment";
import { ApiError } from "../../http";
import { hashToken } from "./crypto";

export async function limit(
  c: Context<Environment>,
  scope: string,
  subject: string,
  max: number,
  periodMs: number,
) {
  const now = Date.now();
  const key = await hashToken(`${scope}:${subject}`);
  const row = await c.env.DB.prepare(
    `INSERT INTO rate_limit_buckets (key, hits, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET hits = CASE WHEN expires_at <= ? THEN 1 ELSE hits + 1 END,
    expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END RETURNING hits, expires_at`,
  )
    .bind(key, now + periodMs, now, now)
    .first<{ hits: number; expires_at: number }>();
  if (!row || row.hits > max) {
    c.header(
      "Retry-After",
      String(
        Math.max(
          1,
          Math.ceil(((row?.expires_at ?? now + periodMs) - now) / 1000),
        ),
      ),
    );
    throw new ApiError("RATE_LIMITED", 429);
  }
}
