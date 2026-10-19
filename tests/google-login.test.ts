import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { app } from "../worker";
import { testDatabase } from "./helpers/sqlite-d1";

const keys = vi.hoisted(() => ({ jwk: {} as Record<string, unknown> }));
vi.mock("jose", async (original) => {
  const actual = await original<typeof import("jose")>();
  return {
    ...actual,
    createRemoteJWKSet:
      () =>
      (...args: Parameters<ReturnType<typeof actual.createLocalJWKSet>>) =>
        actual.createLocalJWKSet({ keys: [keys.jwk] })(...args),
  };
});
let database: ReturnType<typeof testDatabase>;
let privateKey: CryptoKey;
const origin = "https://koveya.example",
  clientId = "test-client.apps.googleusercontent.com";
beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  keys.jwk = {
    ...(await exportJWK(pair.publicKey)),
    kid: "google-test",
    alg: "RS256",
  };
});
beforeEach(() => {
  database = testDatabase();
});
afterEach(() => {
  database.sqlite.close();
  vi.restoreAllMocks();
});
async function request(path: string, value?: unknown, cookie = "") {
  return app.request(
    origin + "/api/v1" + path,
    {
      method: value === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    },
    { DB: database.binding, APP_ORIGIN: origin, GOOGLE_CLIENT_ID: clientId },
  );
}
const cookieOf = (r: Response, name: string) =>
  r.headers
    .getSetCookie()
    .find((v) => v.startsWith(`__Host-koveya_${name}=`))!
    .split(";")[0];
async function start(link = false, session = "") {
  const response = await request(
    "/auth/google/start",
    { returnTo: "/p/coach?time=chosen", locale: "en", link },
    session,
  );
  expect(response.status).toBe(200);
  return {
    nonce: ((await response.json()) as { data: { nonce: string } }).data.nonce,
    cookie: cookieOf(response, "google"),
  };
}
async function token(nonce: string, overrides: Record<string, unknown> = {}) {
  return new SignJWT({
    nonce,
    email: "customer@gmail.com",
    email_verified: true,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "google-test" })
    .setSubject(String(overrides.sub ?? "google-subject-1"))
    .setIssuer(String(overrides.iss ?? "https://accounts.google.com"))
    .setAudience(String(overrides.aud ?? clientId))
    .setIssuedAt()
    .setExpirationTime((overrides.exp as number) ?? "5m")
    .sign(privateKey);
}
async function signIn() {
  const begun = await start();
  const credential = await token(begun.nonce);
  const response = await request(
    "/auth/google/verify",
    { credential },
    begun.cookie,
  );
  expect(response.status).toBe(200);
  return {
    ...begun,
    credential,
    response,
    session: cookieOf(response, "session"),
  };
}
describe("ID-008 / ID-010 Google identity security", () => {
  it("verifies a signed token, preserves booking intent, and creates a normal usable session", async () => {
    const signed = await signIn();
    expect(await signed.response.json()).toMatchObject({
      data: { returnTo: "/p/coach?time=chosen" },
    });
    const me = await request("/me", undefined, signed.session);
    expect(await me.json()).toMatchObject({
      data: { user: { email: "customer@gmail.com", locale: "en" } },
    });
    expect(
      database.sqlite.prepare("SELECT COUNT(*) n FROM identities").get()?.n,
    ).toBe(2);
    expect(
      JSON.stringify(
        database.sqlite.prepare("SELECT * FROM google_challenges").all(),
      ),
    ).not.toContain(signed.nonce);
    expect(
      JSON.stringify(database.sqlite.prepare("SELECT * FROM sessions").all()),
    ).not.toContain(signed.session.split("=")[1]);
    expect(signed.response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(signed.response.headers.get("set-cookie")).toContain("Secure");
  });
  it.each([
    { aud: "wrong-client" },
    { iss: "https://evil.example" },
    { exp: 1 },
    { email_verified: false },
    { email: "invalid" },
    { azp: "wrong-client" },
  ])("rejects invalid Google claims %j", async (overrides) => {
    const begun = await start();
    expect(
      (
        await request(
          "/auth/google/verify",
          { credential: await token(begun.nonce, overrides) },
          begun.cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      database.sqlite.prepare("SELECT COUNT(*) n FROM users").get()?.n,
    ).toBe(0);
  });
  it("rejects forged signatures rather than decoding the payload", async () => {
    const begun = await start();
    const real = await token(begun.nonce);
    const parts = real.split(".");
    parts[1] = Buffer.from(
      JSON.stringify({ nonce: begun.nonce, email: "attacker@gmail.com" }),
    ).toString("base64url");
    expect(
      (
        await request(
          "/auth/google/verify",
          { credential: parts.join(".") },
          begun.cookie,
        )
      ).status,
    ).toBe(400);
  });
  it("rejects another browser, another nonce, expired challenge and replay", async () => {
    const begun = await start();
    const credential = await token(begun.nonce);
    expect((await request("/auth/google/verify", { credential })).status).toBe(
      400,
    );
    expect(
      (
        await request(
          "/auth/google/verify",
          { credential: await token("a".repeat(64)) },
          begun.cookie,
        )
      ).status,
    ).toBe(400);
    database.sqlite.exec("UPDATE google_challenges SET expires_at=1");
    expect(
      (await request("/auth/google/verify", { credential }, begun.cookie))
        .status,
    ).toBe(400);
    const signed = await signIn();
    expect(
      (
        await request(
          "/auth/google/verify",
          { credential: signed.credential },
          signed.cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      database.sqlite.prepare("SELECT COUNT(*) n FROM sessions").get()?.n,
    ).toBe(1);
  });
  it("does not merge an existing email account; explicitly links only with its current session", async () => {
    database.sqlite
      .exec(`INSERT INTO users (id,name,created_at) VALUES ('existing','Owner',1);
      INSERT INTO identities VALUES ('email-id','existing','email','customer@gmail.com');`);
    const begun = await start();
    const response = await request(
      "/auth/google/verify",
      { credential: await token(begun.nonce) },
      begun.cookie,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "GOOGLE_LINK_REQUIRED" },
    });
    // Represents an already verified Email session; no test-only auth exists in production.
    const { hashToken } = await import("../worker/modules/identity/crypto");
    const raw = "b".repeat(64);
    database.sqlite
      .prepare(
        "INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,'existing',?)",
      )
      .run(await hashToken(raw), Date.now() + 60000);
    const ownerSession = `__Host-koveya_session=${raw}`;
    const link = await start(true, ownerSession);
    expect(
      (
        await request(
          "/auth/google/verify",
          { credential: await token(link.nonce) },
          link.cookie,
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await request(
          "/auth/google/verify",
          { credential: await token(link.nonce, { email: "other@gmail.com" }) },
          link.cookie + "; " + ownerSession,
        )
      ).status,
    ).toBe(409);
    const linked = await request(
      "/auth/google/verify",
      { credential: await token(link.nonce) },
      link.cookie + "; " + ownerSession,
    );
    expect(linked.status).toBe(200);
    expect(
      database.sqlite
        .prepare("SELECT user_id FROM identities WHERE provider='google'")
        .get()?.user_id,
    ).toBe("existing");
    expect((await request("/me", undefined, ownerSession)).status).toBe(401);
    expect(
      database.sqlite.prepare("SELECT COUNT(*) n FROM users").get()?.n,
    ).toBe(1);
  });
  it("blocks suspended users and rotates sessions on repeat Google sign-in", async () => {
    const first = await signIn();
    const begun = await start();
    const next = await request(
      "/auth/google/verify",
      { credential: await token(begun.nonce) },
      begun.cookie + "; " + first.session,
    );
    expect(next.status).toBe(200);
    expect((await request("/me", undefined, first.session)).status).toBe(401);
    database.sqlite.exec("UPDATE users SET status='SUSPENDED'");
    const again = await start();
    expect(
      (
        await request(
          "/auth/google/verify",
          { credential: await token(again.nonce) },
          again.cookie,
        )
      ).status,
    ).toBe(400);
    expect(
      database.sqlite.prepare("SELECT COUNT(*) n FROM sessions").get()?.n,
    ).toBe(2);
  });
  it("rolls back nonce consumption and account creation when the session write fails", async () => {
    const begun = await start();
    const credential = await token(begun.nonce);
    database.sqlite.exec(
      "CREATE TRIGGER fail_session BEFORE INSERT ON sessions BEGIN SELECT RAISE(ABORT,'failure'); END",
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      (await request("/auth/google/verify", { credential }, begun.cookie))
        .status,
    ).toBe(500);
    expect(
      database.sqlite
        .prepare("SELECT consumed_nonce FROM google_challenges")
        .get()?.consumed_nonce,
    ).toBeNull();
    expect(
      database.sqlite.prepare("SELECT COUNT(*) n FROM users").get()?.n,
    ).toBe(0);
    database.sqlite.exec("DROP TRIGGER fail_session");
    expect(
      (await request("/auth/google/verify", { credential }, begun.cookie))
        .status,
    ).toBe(200);
  });
  it("sanitizes return URLs and requires a session for link setup", async () => {
    expect((await request("/auth/google/start", { link: true })).status).toBe(
      401,
    );
    const begun = await request("/auth/google/start", {
      returnTo: "https://evil.example",
    });
    const nonce = ((await begun.json()) as { data: { nonce: string } }).data
      .nonce;
    const verified = await request(
      "/auth/google/verify",
      { credential: await token(nonce) },
      cookieOf(begun, "google"),
    );
    expect(await verified.json()).toMatchObject({ data: { returnTo: "/app" } });
  });
});
