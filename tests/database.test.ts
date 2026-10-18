import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let db: DatabaseSync;
beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort())
    db.exec(readFileSync(`migrations/${file}`, "utf8"));
  db.exec(readFileSync("seeds/demo.sql", "utf8"));
});
afterEach(() => db.close());

function fixture() {
  db.exec(`INSERT INTO resources VALUES ('r1', 'org-demo', 'Coach', 'Asia/Taipei');
    INSERT INTO client_relationships (id, org_id, name) VALUES ('c1', 'org-demo', 'Client');
    INSERT INTO bookings (id, org_id, offering_id, client_id, starts_at, ends_at, status, terms_snapshot, created_at)
    VALUES ('b1', 'org-demo', 'offering-demo-tennis', 'c1', 1792407600000, 1792411200000, 'CONFIRMED', '{}', 1792272000000);`);
}

describe("Initial database constraints (not full booking API acceptance)", () => {
  it("rebuilds from migrations and re-seeds safely", () => {
    db.exec(readFileSync("seeds/demo.sql", "utf8"));
    expect(db.prepare("SELECT COUNT(*) AS n FROM services").get()?.n).toBe(3);
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
  it("SCH-007: database rejects duplicate allocations", () => {
    fixture();
    db.exec(
      "INSERT INTO booking_allocations VALUES ('org-demo', 'b1', 'r1', 1792407600000)",
    );
    expect(() =>
      db.exec(
        "INSERT INTO booking_allocations VALUES ('org-demo', 'b1', 'r1', 1792407600000)",
      ),
    ).toThrow(/UNIQUE/);
  });
  it("tenant composite keys reject a resource from another business", () => {
    fixture();
    db.exec(
      "INSERT INTO organizations (id, name, status, created_at) VALUES ('org-other', 'Other', 'ACTIVE', 1); INSERT INTO resources VALUES ('r2', 'org-other', 'Other Coach', 'Asia/Taipei')",
    );
    expect(() =>
      db.exec(
        "INSERT INTO booking_allocations VALUES ('org-demo', 'b1', 'r2', 1792407600000)",
      ),
    ).toThrow(/FOREIGN KEY/);
  });
  it("a failed allocation can roll back the preceding booking insert", () => {
    fixture();
    db.exec(
      "INSERT INTO booking_allocations VALUES ('org-demo', 'b1', 'r1', 1792407600000)",
    );
    db.exec("BEGIN");
    try {
      db.exec(
        "INSERT INTO bookings SELECT 'b2', org_id, offering_id, client_id, starts_at, ends_at, status, terms_snapshot, created_at, version FROM bookings WHERE id = 'b1'",
      );
      db.exec(
        "INSERT INTO booking_allocations VALUES ('org-demo', 'b2', 'r1', 1792407600000)",
      );
      throw new Error("Expected allocation conflict");
    } catch (error) {
      db.exec("ROLLBACK");
      expect(String(error)).toContain("UNIQUE");
    }
    expect(
      db.prepare("SELECT id FROM bookings WHERE id = 'b2'").get(),
    ).toBeUndefined();
    expect(
      db.prepare("SELECT id FROM bookings WHERE id = 'b1'").get()?.id,
    ).toBe("b1");
  });
  it("PRO-005: rejects a non-granular service duration", () => {
    expect(() =>
      db.exec(
        "UPDATE offerings SET duration_minutes = 46 WHERE id = 'offering-demo-tennis'",
      ),
    ).toThrow(/CHECK/);
  });
  it("PRO-004: quote has no fabricated zero price", () => {
    expect(() =>
      db.exec(
        "UPDATE offerings SET pricing_type = 'QUOTE', price_minor = 0 WHERE id = 'offering-demo-tennis'",
      ),
    ).toThrow(/CHECK/);
  });
  it("PRO-004: a free offering requires an explicit zero amount", () => {
    expect(() =>
      db.exec(
        "UPDATE offerings SET pricing_type = 'FREE', price_minor = NULL WHERE id = 'offering-demo-tennis'",
      ),
    ).toThrow(/CHECK/);
  });
});
