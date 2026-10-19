import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Environment } from "../../environment";
import { ApiError } from "../../http";
import { hashToken } from "./crypto";
import { limit } from "./rate-limit";

export const SESSION_SECONDS = 7 * 24 * 60 * 60;
export const LOGIN_SECONDS = 10 * 60;

function cookieName(
  c: Context<Environment>,
  type: "session" | "login" | "google",
) {
  return `${new URL(c.req.url).protocol === "https:" ? "__Host-" : ""}koveya_${type}`;
}

export function writeCookie(
  c: Context<Environment>,
  type: "session" | "login" | "google",
  value: string,
  maxAge: number,
) {
  setCookie(c, cookieName(c, type), value, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
    maxAge,
  });
}

export function readCookie(
  c: Context<Environment>,
  type: "session" | "login" | "google",
) {
  return getCookie(c, cookieName(c, type));
}
export function clearCookie(
  c: Context<Environment>,
  type: "session" | "login" | "google",
) {
  deleteCookie(c, cookieName(c, type), {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
  });
}

export async function sessionUser(c: Context<Environment>) {
  const token = readCookie(c, "session");
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const tokenHash = await hashToken(token);
  const row = await c.env.DB.prepare(
    `SELECT s.user_id FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ? AND u.status = 'ACTIVE'`,
  )
    .bind(tokenHash, Date.now())
    .first<{ user_id: string }>();
  if (!row) return null;
  return { userId: row.user_id, sessionHash: tokenHash };
}

export const requireUser: MiddlewareHandler<Environment> = async (c, next) => {
  const user = await sessionUser(c);
  if (!user) throw new ApiError("AUTH_REQUIRED", 401);
  c.set("userId", user.userId);
  c.set("sessionHash", user.sessionHash);
  if (!["GET", "HEAD"].includes(c.req.method))
    await limit(c, "account-write", user.userId, 60, 60_000);
  await next();
};
