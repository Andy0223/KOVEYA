import { describe, expect, it } from "vitest";
import { app } from "../worker";

describe("API boundary", () => {
  it("unknown API routes return JSON, not the SPA", async () => {
    const response = await app.request("/api/v1/unknown");
    expect(response.status).toBe(404);
    const body = (await response.json()) as {
      error: { code: string };
      requestId: string;
    };
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.requestId).toMatch(/^[\da-f-]{36}$/);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects malformed public slugs before querying the database", async () => {
    const response = await app.request("/api/v1/providers/bad_slug");
    expect(response.status).toBe(400);
    expect(
      ((await response.json()) as { error: { code: string } }).error.code,
    ).toBe("VALIDATION_ERROR");
  });
  it("reports an uninitialized database without leaking errors", async () => {
    const response = await app.request(
      "/api/v1/health",
      {},
      {
        DB: {
          prepare() {
            throw new Error("private database detail");
          },
        },
      },
    );
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toContain("SERVICE_UNAVAILABLE");
    expect(text).not.toContain("private database detail");
  });
});
