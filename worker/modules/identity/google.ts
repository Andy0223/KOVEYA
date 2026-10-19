import { Hono } from "hono";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import type { Environment } from "../../environment";
import { ApiError, body, ok } from "../../http";
import { locale, safeReturnTo } from "../../validation";
import { hashToken, randomToken } from "./crypto";
import { limit } from "./rate-limit";
import {
  clearCookie,
  LOGIN_SECONDS,
  readCookie,
  SESSION_SECONDS,
  sessionUser,
  writeCookie,
} from "./session";

const googleKeys = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
  { timeoutDuration: 5000 },
);

// No tokeninfo debug endpoint, unsigned decode, or client-supplied user/email IDs.
export async function verifyGoogleToken(credential: string, clientId: string) {
  try {
    const { payload } = await jwtVerify(credential, googleKeys, {
      algorithms: ["RS256"],
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
      requiredClaims: ["exp", "iat", "sub", "nonce", "email", "email_verified"],
      maxTokenAge: "10m",
    });
    if (
      payload.email_verified !== true ||
      typeof payload.email !== "string" ||
      !z.email().max(254).safeParse(payload.email).success ||
      typeof payload.sub !== "string" ||
      payload.sub.length > 255 ||
      typeof payload.nonce !== "string" ||
      !/^[a-f0-9]{64}$/.test(payload.nonce) ||
      (payload.azp !== undefined && payload.azp !== clientId)
    )
      throw new Error("Invalid claims");
    return {
      subject: payload.sub,
      email: payload.email.toLowerCase(),
      nonce: payload.nonce,
    };
  } catch {
    throw new ApiError("GOOGLE_LOGIN_INVALID", 400);
  }
}

export const googleRoutes = new Hono<Environment>();
googleRoutes.post("/auth/google/start", async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) throw new ApiError("SERVICE_UNAVAILABLE", 503);
  await limit(
    c,
    "google-start",
    c.req.header("CF-Connecting-IP") ?? "local",
    60,
    15 * 60_000,
  );
  const input = await body(
    c,
    z
      .object({
        returnTo: z.string().default("/app").transform(safeReturnTo),
        locale: locale.default("zh-TW"),
        link: z.boolean().default(false),
      })
      .strict(),
  );
  const current = await sessionUser(c);
  if (input.link && !current) throw new ApiError("AUTH_REQUIRED", 401);
  const nonce = randomToken(),
    browser = randomToken();
  await c.env.DB.prepare(
    `INSERT INTO google_challenges (nonce_hash,browser_hash,return_to,locale,link_session_hash,expires_at) VALUES (?,?,?,?,?,?)`,
  )
    .bind(
      await hashToken(nonce),
      await hashToken(browser),
      input.returnTo,
      input.locale,
      input.link ? current!.sessionHash : null,
      Date.now() + LOGIN_SECONDS * 1000,
    )
    .run();
  writeCookie(c, "google", browser, LOGIN_SECONDS);
  return ok(c, { nonce });
});

googleRoutes.post("/auth/google/verify", async (c) => {
  if (!c.env.GOOGLE_CLIENT_ID) throw new ApiError("SERVICE_UNAVAILABLE", 503);
  await limit(
    c,
    "google-verify",
    c.req.header("CF-Connecting-IP") ?? "local",
    60,
    15 * 60_000,
  );
  const input = await body(
    c,
    z.object({ credential: z.string().min(1).max(12000) }).strict(),
  );
  const browser = readCookie(c, "google");
  if (!browser || !/^[a-f0-9]{64}$/.test(browser))
    throw new ApiError("GOOGLE_LOGIN_INVALID", 400);
  const claims = await verifyGoogleToken(
    input.credential,
    c.env.GOOGLE_CLIENT_ID,
  );
  const nonceHash = await hashToken(claims.nonce),
    browserHash = await hashToken(browser),
    now = Date.now();
  const db = c.env.DB;
  const challenge = await db
    .prepare(
      `SELECT return_to,locale,link_session_hash FROM google_challenges WHERE nonce_hash=? AND browser_hash=? AND expires_at>? AND consumed_nonce IS NULL`,
    )
    .bind(nonceHash, browserHash, now)
    .first<{
      return_to: string;
      locale: string;
      link_session_hash: string | null;
    }>();
  if (!challenge) throw new ApiError("GOOGLE_LOGIN_INVALID", 400);
  const current = await sessionUser(c);
  const linking = challenge.link_session_hash !== null;
  if (
    linking &&
    (!current || current.sessionHash !== challenge.link_session_hash)
  )
    throw new ApiError("AUTH_REQUIRED", 401);
  const google = await db
    .prepare(
      "SELECT user_id FROM identities WHERE provider='google' AND provider_subject=?",
    )
    .bind(claims.subject)
    .first<{ user_id: string }>();
  const email = await db
    .prepare(
      "SELECT user_id FROM identities WHERE provider='email' AND provider_subject=?",
    )
    .bind(claims.email)
    .first<{ user_id: string }>();
  // Email equality alone never merges accounts. Linking requires the pre-existing authenticated session.
  if (
    linking &&
    (email?.user_id !== current!.userId ||
      (google && google.user_id !== current!.userId))
  )
    throw new ApiError("GOOGLE_ACCOUNT_CONFLICT", 409);
  if (!google && email && !linking)
    throw new ApiError("GOOGLE_LINK_REQUIRED", 409);
  const userId = google?.user_id ?? email?.user_id ?? crypto.randomUUID();
  const existing = google || email;
  const consume = crypto.randomUUID(),
    rawSession = randomToken(),
    sessionHash = await hashToken(rawSession);
  const guard =
    "SELECT 1 FROM google_challenges WHERE nonce_hash=? AND consumed_nonce=?";
  const writes = [
    db
      .prepare(
        `UPDATE google_challenges SET consumed_nonce=? WHERE nonce_hash=? AND browser_hash=? AND expires_at>? AND consumed_nonce IS NULL
      AND (link_session_hash IS NULL OR EXISTS (SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id
        WHERE s.token_hash=google_challenges.link_session_hash AND s.revoked_at IS NULL AND s.expires_at>? AND u.status='ACTIVE'))`,
      )
      .bind(consume, nonceHash, browserHash, now, now),
  ];
  if (!existing) {
    writes.push(
      db
        .prepare(
          `INSERT INTO users (id,name,locale,timezone,status,created_at) SELECT ?,?,?, 'Asia/Taipei','ACTIVE',? WHERE EXISTS (${guard})`,
        )
        .bind(
          userId,
          claims.email.split("@")[0],
          challenge.locale,
          now,
          nonceHash,
          consume,
        ),
    );
    writes.push(
      db
        .prepare(
          `INSERT INTO identities (id,user_id,provider,provider_subject) SELECT ?,?,'email',? WHERE EXISTS (${guard})`,
        )
        .bind(crypto.randomUUID(), userId, claims.email, nonceHash, consume),
    );
  }
  if (!google)
    writes.push(
      db
        .prepare(
          `INSERT INTO identities (id,user_id,provider,provider_subject) SELECT ?,u.id,'google',? FROM users u WHERE u.id=? AND u.status='ACTIVE' AND EXISTS (${guard})`,
        )
        .bind(crypto.randomUUID(), claims.subject, userId, nonceHash, consume),
    );
  const sessionIndex = writes.length;
  writes.push(
    db
      .prepare(
        `INSERT INTO sessions (token_hash,user_id,expires_at) SELECT ?,u.id,? FROM users u JOIN identities i ON i.user_id=u.id AND i.provider='google' AND i.provider_subject=? WHERE u.id=? AND u.status='ACTIVE' AND EXISTS (${guard})`,
      )
      .bind(
        sessionHash,
        now + SESSION_SECONDS * 1000,
        claims.subject,
        userId,
        nonceHash,
        consume,
      ),
  );
  writes.push(
    db
      .prepare(
        `INSERT INTO audit_logs (id,actor_id,action,entity_id,created_at) SELECT ?,user_id,?,user_id,? FROM sessions WHERE token_hash=?`,
      )
      .bind(
        crypto.randomUUID(),
        linking ? "auth.google_linked" : "auth.google_signed_in",
        now,
        sessionHash,
      ),
  );
  if (current)
    writes.push(
      db
        .prepare(
          `UPDATE sessions SET revoked_at=? WHERE token_hash=? AND EXISTS (SELECT 1 FROM sessions WHERE token_hash=?)`,
        )
        .bind(now, current.sessionHash, sessionHash),
    );
  const result = await db.batch(writes);
  if (result[sessionIndex]?.meta.changes !== 1)
    throw new ApiError("GOOGLE_LOGIN_INVALID", 400);
  writeCookie(c, "session", rawSession, SESSION_SECONDS);
  clearCookie(c, "google");
  return ok(c, { returnTo: challenge.return_to });
});
