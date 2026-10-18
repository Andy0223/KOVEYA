import type { Context, MiddlewareHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodType } from "zod";
import type { Environment } from "./environment";

export class ApiError extends Error {
  constructor(
    public code: string,
    public status: ContentfulStatusCode,
    message = code,
  ) {
    super(message);
  }
}

export const ok = <T>(c: Context<Environment>, data: T) =>
  c.json({ data, requestId: c.get("requestId") });

export function isLocalPreview(c: Context<Environment>): boolean {
  const url = new URL(c.req.url);
  return (
    c.env.LOCAL_EMAIL_PREVIEW === "true" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  );
}

export function appOrigin(c: Context<Environment>): string {
  if (isLocalPreview(c)) return new URL(c.req.url).origin;
  if (!c.env.APP_ORIGIN) throw new ApiError("SERVICE_UNAVAILABLE", 503);
  const url = new URL(c.env.APP_ORIGIN);
  if (url.protocol !== "https:" || url.origin !== c.env.APP_ORIGIN)
    throw new ApiError("SERVICE_UNAVAILABLE", 503);
  return url.origin;
}

export const protectWrites: MiddlewareHandler<Environment> = async (
  c,
  next,
) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    if (c.req.header("Origin") !== appOrigin(c))
      throw new ApiError("FORBIDDEN", 403);
    if (
      !(c.req.header("Content-Type") ?? "")
        .toLowerCase()
        .startsWith("application/json")
    )
      throw new ApiError("VALIDATION_ERROR", 400);
    const length = Number(c.req.header("Content-Length") ?? 0);
    if (length > 16_384) throw new ApiError("PAYLOAD_TOO_LARGE", 413);
  }
  await next();
};

export async function body<T>(
  c: Context<Environment>,
  schema: ZodType<T>,
): Promise<T> {
  let value: unknown;
  try {
    const raw = await c.req.text();
    if (new TextEncoder().encode(raw).length > 16_384)
      throw new ApiError("PAYLOAD_TOO_LARGE", 413);
    value = JSON.parse(raw);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError("VALIDATION_ERROR", 400);
  }
  const result = schema.safeParse(value);
  if (!result.success) throw new ApiError("VALIDATION_ERROR", 400);
  return result.data;
}
