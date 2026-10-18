import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import { getPublicProvider } from "./modules/catalog/repository";
import type { Environment } from "./environment";
import { ApiError, protectWrites } from "./http";
import { identityRoutes } from "./modules/identity/routes";
import { businessRoutes } from "./modules/business/routes";
export const app = new Hono<Environment>();

app.use("*", requestId({ generator: () => crypto.randomUUID() }));
app.use("*", secureHeaders());
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  c.header("Referrer-Policy", "no-referrer");
  await next();
});
app.use(
  "/api/*",
  bodyLimit({
    maxSize: 16_384,
    onError: () => {
      throw new ApiError("PAYLOAD_TOO_LARGE", 413);
    },
  }),
);
app.use("/api/*", protectWrites);
app.route("/api/v1", identityRoutes);
app.route("/api/v1", businessRoutes);

app.get("/api/v1/health", async (c) => {
  try {
    await c.env.DB.prepare("SELECT id FROM organizations LIMIT 1").first();
    return c.json({
      data: { status: "ok", database: "ready", version: "0.2.0" },
      requestId: c.get("requestId"),
    });
  } catch {
    return c.json(
      {
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Database is not ready.",
        },
        requestId: c.get("requestId"),
      },
      503,
    );
  }
});

app.get("/api/v1/providers/:slug", async (c) => {
  const slug = c.req.param("slug");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
    return c.json(
      {
        error: { code: "VALIDATION_ERROR", message: "Invalid provider slug." },
        requestId: c.get("requestId"),
      },
      400,
    );
  }
  const provider = await getPublicProvider(c.env.DB, slug);
  if (!provider)
    return c.json(
      {
        error: { code: "NOT_FOUND", message: "Provider not found." },
        requestId: c.get("requestId"),
      },
      404,
    );
  return c.json({ data: provider, requestId: c.get("requestId") });
});

app.notFound((c) =>
  c.json(
    {
      error: { code: "NOT_FOUND", message: "API route not found." },
      requestId: c.get("requestId"),
    },
    404,
  ),
);
app.onError((error, c) => {
  if (error instanceof ApiError)
    return c.json(
      {
        error: { code: error.code, message: error.message },
        requestId: c.get("requestId"),
      },
      error.status,
    );
  // No request payloads, cookies, credentials, or raw database errors in responses.
  console.error(
    JSON.stringify({
      event: "api.error",
      requestId: c.get("requestId"),
      name: error.name,
    }),
  );
  return c.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "An unexpected error occurred.",
      },
      requestId: c.get("requestId"),
    },
    500,
  );
});

export default app;
