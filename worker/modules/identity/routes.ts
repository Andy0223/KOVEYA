import { Hono } from "hono";
import { z } from "zod";
import type { Environment } from "../../environment";
import { ApiError, appOrigin, body, isLocalPreview, ok } from "../../http";
import { emailStartInput, locale, timezone } from "../../validation";
import { hashToken, randomToken } from "./crypto";
import { googleRoutes } from "./google";
import { deliverLoginEmail } from "./email";
import { limit } from "./rate-limit";
import {
  clearCookie,
  LOGIN_SECONDS,
  readCookie,
  requireUser,
  SESSION_SECONDS,
  sessionUser,
  writeCookie,
} from "./session";

export const identityRoutes = new Hono<Environment>();
identityRoutes.route("/", googleRoutes);

identityRoutes.get("/auth/config", (c) =>
  ok(c, {
    googleClientId: c.env.GOOGLE_CLIENT_ID || null,
    delivery: isLocalPreview(c)
      ? "local"
      : c.env.RESEND_API_KEY && c.env.EMAIL_FROM && c.env.APP_ORIGIN
        ? "email"
        : "unavailable",
  }),
);

identityRoutes.post("/auth/email/start", async (c) => {
  await limit(
    c,
    "login-ip",
    c.req.header("CF-Connecting-IP") ?? "local",
    120,
    15 * 60_000,
  );
  const input = await body(c, emailStartInput);
  await limit(c, "login-email", input.email, 3, 15 * 60_000);
  const local = isLocalPreview(c);
  if (!local && (!c.env.RESEND_API_KEY || !c.env.EMAIL_FROM))
    throw new ApiError("SERVICE_UNAVAILABLE", 503);
  const token = randomToken(),
    browser = randomToken();
  const tokenHash = await hashToken(token);
  const link = `${appOrigin(c)}/auth/verify#token=${token}`;
  await c.env.DB.prepare(
    `INSERT INTO email_challenges (token_hash, browser_hash, email, return_to, locale, expires_at) VALUES (?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      tokenHash,
      await hashToken(browser),
      input.email,
      input.returnTo,
      input.locale,
      Date.now() + LOGIN_SECONDS * 1000,
    )
    .run();
  try {
    if (!local)
      await deliverLoginEmail(
        c.env.RESEND_API_KEY!,
        c.env.EMAIL_FROM!,
        input.email,
        link,
        input.locale,
        crypto.randomUUID(),
      );
  } catch (error) {
    await c.env.DB.prepare("DELETE FROM email_challenges WHERE token_hash = ?")
      .bind(tokenHash)
      .run();
    throw error;
  }
  writeCookie(c, "login", browser, LOGIN_SECONDS);
  return ok(c, {
    sent: true,
    expiresInSeconds: LOGIN_SECONDS,
    ...(local ? { localPreviewUrl: link } : {}),
  });
});

identityRoutes.post("/auth/email/verify", async (c) => {
  await limit(
    c,
    "verify-ip",
    c.req.header("CF-Connecting-IP") ?? "local",
    60,
    15 * 60_000,
  );
  const input = await body(
    c,
    z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  );
  const browser = readCookie(c, "login");
  if (!browser || !/^[a-f0-9]{64}$/.test(browser))
    throw new ApiError("INVALID_LOGIN_LINK", 400);
  const tokenHash = await hashToken(input.token),
    browserHash = await hashToken(browser);
  const nonce = crypto.randomUUID(),
    candidateUserId = crypto.randomUUID(),
    rawSession = randomToken();
  const sessionHash = await hashToken(rawSession),
    now = Date.now();
  const previousSession = readCookie(c, "session");
  const previousHash = previousSession ? await hashToken(previousSession) : "";
  const db = c.env.DB;
  // Every subsequent write is guarded by this verification's nonce. A zero-row consume
  // cannot create a user, identity, or session, even during concurrent replay.
  const results = await db.batch([
    db
      .prepare(
        `UPDATE email_challenges SET consumed_at = ?, consumed_nonce = ? WHERE token_hash = ? AND browser_hash = ? AND expires_at > ? AND consumed_at IS NULL`,
      )
      .bind(now, nonce, tokenHash, browserHash, now),
    db
      .prepare(
        `INSERT INTO users (id, name, locale, timezone, status, created_at)
      SELECT ?, substr(e.email, 1, instr(e.email, '@') - 1), e.locale, 'Asia/Taipei', 'ACTIVE', ? FROM email_challenges e
      WHERE e.token_hash = ? AND e.consumed_nonce = ? AND NOT EXISTS (SELECT 1 FROM identities WHERE provider = 'email' AND provider_subject = e.email)`,
      )
      .bind(candidateUserId, now, tokenHash, nonce),
    db
      .prepare(
        `INSERT INTO identities (id, user_id, provider, provider_subject)
      SELECT ?, u.id, 'email', e.email FROM users u JOIN email_challenges e ON e.token_hash = ? AND e.consumed_nonce = ? WHERE u.id = ?`,
      )
      .bind(crypto.randomUUID(), tokenHash, nonce, candidateUserId),
    db
      .prepare(
        `INSERT INTO sessions (token_hash, user_id, expires_at)
      SELECT ?, i.user_id, ? FROM email_challenges e JOIN identities i ON i.provider = 'email' AND i.provider_subject = e.email
      JOIN users u ON u.id = i.user_id AND u.status = 'ACTIVE' WHERE e.token_hash = ? AND e.consumed_nonce = ?`,
      )
      .bind(sessionHash, now + SESSION_SECONDS * 1000, tokenHash, nonce),
    db
      .prepare(
        `INSERT INTO audit_logs (id, actor_id, action, entity_id, created_at)
      SELECT ?, user_id, 'auth.signed_in', user_id, ? FROM sessions WHERE token_hash = ?`,
      )
      .bind(crypto.randomUUID(), now, sessionHash),
    db
      .prepare(
        `UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND EXISTS (SELECT 1 FROM sessions WHERE token_hash = ?)`,
      )
      .bind(now, previousHash, sessionHash),
  ]);
  if (results[3]?.meta.changes !== 1)
    throw new ApiError("INVALID_LOGIN_LINK", 400);
  const challenge = await db
    .prepare("SELECT return_to FROM email_challenges WHERE token_hash = ?")
    .bind(tokenHash)
    .first<{ return_to: string }>();
  writeCookie(c, "session", rawSession, SESSION_SECONDS);
  clearCookie(c, "login");
  return ok(c, { returnTo: challenge?.return_to ?? "/app" });
});

identityRoutes.post("/auth/logout", async (c) => {
  const current = await sessionUser(c);
  if (current)
    await c.env.DB.batch([
      c.env.DB.prepare(
        "UPDATE sessions SET revoked_at = ? WHERE token_hash = ?",
      ).bind(Date.now(), current.sessionHash),
      c.env.DB.prepare(
        "INSERT INTO audit_logs (id, actor_id, action, entity_id, created_at) VALUES (?, ?, ?, ?, ?)",
      ).bind(
        crypto.randomUUID(),
        current.userId,
        "auth.signed_out",
        current.userId,
        Date.now(),
      ),
    ]);
  clearCookie(c, "session");
  return ok(c, { signedOut: true });
});

identityRoutes.post("/auth/sessions/revoke-all", requireUser, async (c) => {
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
    ).bind(Date.now(), c.get("userId")),
    c.env.DB.prepare(
      "INSERT INTO audit_logs (id, actor_id, action, entity_id, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(
      crypto.randomUUID(),
      c.get("userId"),
      "auth.all_sessions_revoked",
      c.get("userId"),
      Date.now(),
    ),
  ]);
  clearCookie(c, "session");
  return ok(c, { revoked: true });
});

identityRoutes.get("/me", requireUser, async (c) => {
  const user = await c.env.DB.prepare(
    `SELECT u.id, u.name, u.locale, u.timezone, i.provider_subject AS email FROM users u JOIN identities i ON i.user_id = u.id AND i.provider = 'email' WHERE u.id = ?`,
  )
    .bind(c.get("userId"))
    .first();
  const business = await c.env.DB.prepare(
    `SELECT p.org_id AS orgId, p.public_name AS publicName, p.slug FROM provider_profiles p
    JOIN organizations o ON o.id = p.org_id AND o.status = 'ACTIVE' JOIN organization_members m ON m.org_id = p.org_id
    WHERE m.user_id = ? AND m.role = 'OWNER'`,
  )
    .bind(c.get("userId"))
    .first();
  return ok(c, { user, business });
});

identityRoutes.patch("/me", requireUser, async (c) => {
  const input = await body(
    c,
    z
      .object({ name: z.string().trim().min(1).max(100), locale, timezone })
      .strict(),
  );
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE users SET name = ?, locale = ?, timezone = ? WHERE id = ?",
    ).bind(input.name, input.locale, input.timezone, c.get("userId")),
    c.env.DB.prepare(
      "INSERT INTO audit_logs (id, actor_id, action, entity_id, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(
      crypto.randomUUID(),
      c.get("userId"),
      "user.updated",
      c.get("userId"),
      Date.now(),
    ),
  ]);
  return ok(c, { updated: true });
});

identityRoutes.get("/privacy-requests", requireUser, async (c) => {
  const result = await c.env.DB.prepare(
    "SELECT id, type, status, created_at AS createdAt FROM privacy_requests WHERE user_id = ? ORDER BY created_at DESC",
  )
    .bind(c.get("userId"))
    .all();
  return ok(c, result.results);
});

identityRoutes.post("/privacy-requests", requireUser, async (c) => {
  const input = await body(
    c,
    z.object({ type: z.enum(["EXPORT", "DELETE"]) }).strict(),
  );
  const id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO privacy_requests (id, user_id, type, created_at)
      SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM privacy_requests WHERE user_id = ? AND type = ? AND status IN ('SUBMITTED','PROCESSING'))`,
    ).bind(
      id,
      c.get("userId"),
      input.type,
      Date.now(),
      c.get("userId"),
      input.type,
    ),
    c.env.DB.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, entity_id, created_at)
      SELECT ?, user_id, 'privacy.requested', id, created_at FROM privacy_requests WHERE id = ?`,
    ).bind(crypto.randomUUID(), id),
  ]);
  const request = await c.env.DB.prepare(
    `SELECT id, type, status, created_at AS createdAt FROM privacy_requests WHERE user_id = ? AND type = ? AND status IN ('SUBMITTED','PROCESSING') ORDER BY created_at DESC LIMIT 1`,
  )
    .bind(c.get("userId"), input.type)
    .first();
  return ok(c, request);
});
