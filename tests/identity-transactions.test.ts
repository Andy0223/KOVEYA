import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../worker";
import { testDatabase } from "./helpers/sqlite-d1";

let database: ReturnType<typeof testDatabase>;
const origin = "http://127.0.0.1:5173";
beforeEach(() => {
  database = testDatabase();
});
afterEach(() => {
  database.sqlite.close();
  vi.restoreAllMocks();
});
async function post(path: string, value: unknown, cookie = "") {
  return app.request(
    origin + "/api/v1" + path,
    {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify(value),
    },
    { DB: database.binding, LOCAL_EMAIL_PREVIEW: "true" },
  );
}
async function challenge() {
  const response = await post("/auth/email/start", {
    email: "person@example.test",
  });
  const result = (await response.json()) as {
    data: { localPreviewUrl: string };
  };
  const token = new URLSearchParams(
    new URL(result.data.localPreviewUrl).hash.slice(1),
  ).get("token")!;
  const cookie = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("koveya_login="))!
    .split(";")[0];
  return { token, cookie };
}

describe("ID-002 / ID-007 identity transaction failure paths", () => {
  it("persists hashes rather than raw login or session secrets", async () => {
    const { token, cookie } = await challenge();
    const stored = database.sqlite
      .prepare("SELECT token_hash,browser_hash FROM email_challenges")
      .get();
    expect(stored?.token_hash).not.toBe(token);
    expect(stored?.browser_hash).not.toBe(cookie.split("=")[1]);
    const result = await post("/auth/email/verify", { token }, cookie);
    expect(result.status).toBe(200);
    const session = result.headers
      .getSetCookie()
      .find((value) => value.startsWith("koveya_session="))!
      .split(";")[0]
      .split("=")[1];
    expect(
      database.sqlite.prepare("SELECT token_hash FROM sessions").get()
        ?.token_hash,
    ).not.toBe(session);
    expect(
      JSON.stringify(database.sqlite.prepare("SELECT * FROM audit_logs").all()),
    ).not.toContain(token);
  });
  it("expires login links before creating users or sessions", async () => {
    const { token, cookie } = await challenge();
    database.sqlite.exec("UPDATE email_challenges SET expires_at=1");
    expect((await post("/auth/email/verify", { token }, cookie)).status).toBe(
      400,
    );
    expect(
      database.sqlite.prepare("SELECT COUNT(*) AS n FROM users").get()?.n,
    ).toBe(0);
    expect(
      database.sqlite.prepare("SELECT COUNT(*) AS n FROM sessions").get()?.n,
    ).toBe(0);
  });
  it("rolls back token consumption if session creation fails, allowing a safe retry", async () => {
    const { token, cookie } = await challenge();
    database.sqlite.exec(
      "CREATE TRIGGER reject_session BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'injected failure'); END",
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await post("/auth/email/verify", { token }, cookie)).status).toBe(
      500,
    );
    expect(
      database.sqlite.prepare("SELECT consumed_at FROM email_challenges").get()
        ?.consumed_at,
    ).toBeNull();
    expect(
      database.sqlite.prepare("SELECT COUNT(*) AS n FROM users").get()?.n,
    ).toBe(0);
    expect(
      database.sqlite.prepare("SELECT COUNT(*) AS n FROM identities").get()?.n,
    ).toBe(0);
    database.sqlite.exec("DROP TRIGGER reject_session");
    expect((await post("/auth/email/verify", { token }, cookie)).status).toBe(
      200,
    );
  });
  it("suspended accounts cannot use an existing session or create a new one", async () => {
    const first = await challenge();
    const verified = await post(
      "/auth/email/verify",
      { token: first.token },
      first.cookie,
    );
    const session = verified.headers
      .getSetCookie()
      .find((value) => value.startsWith("koveya_session="))!
      .split(";")[0];
    database.sqlite.exec("UPDATE users SET status='SUSPENDED'");
    const response = await app.request(
      origin + "/api/v1/me",
      { headers: { Cookie: session } },
      { DB: database.binding },
    );
    expect(response.status).toBe(401);
    const second = await challenge();
    expect(
      (await post("/auth/email/verify", { token: second.token }, second.cookie))
        .status,
    ).toBe(400);
    expect(
      database.sqlite.prepare("SELECT COUNT(*) AS n FROM sessions").get()?.n,
    ).toBe(1);
  });
  it("rotates the previous browser session when signing in again", async () => {
    const first = await challenge();
    const verified = await post(
      "/auth/email/verify",
      { token: first.token },
      first.cookie,
    );
    const old = verified.headers
      .getSetCookie()
      .find((value) => value.startsWith("koveya_session="))!
      .split(";")[0];
    const second = await challenge();
    expect(
      (
        await post(
          "/auth/email/verify",
          { token: second.token },
          second.cookie + "; " + old,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await app.request(
          origin + "/api/v1/me",
          { headers: { Cookie: old } },
          { DB: database.binding },
        )
      ).status,
    ).toBe(401);
    expect(
      database.sqlite.prepare("SELECT COUNT(*) AS n FROM users").get()?.n,
    ).toBe(1);
  });
});
