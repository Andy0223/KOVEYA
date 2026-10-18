import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";

// Test adapter executes the application's SQL against real SQLite. It is not a
// replacement for the Workers/D1 integration tests in Playwright.
export function testDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("migrations")
    .filter((file) => file.endsWith(".sql"))
    .sort())
    sqlite.exec(readFileSync(`migrations/${file}`, "utf8"));
  function prepare(sql: string, values: (string | number | null)[] = []) {
    return {
      bind: (...next: (string | number | null)[]) => prepare(sql, next),
      async first(column?: string) {
        const row = sqlite.prepare(sql).get(...values);
        return column ? (row?.[column] ?? null) : (row ?? null);
      },
      async all() {
        return {
          results: sqlite.prepare(sql).all(...values),
          success: true,
          meta: {},
        };
      },
      async run() {
        const result = sqlite.prepare(sql).run(...values);
        return {
          results: [],
          success: true,
          meta: { changes: Number(result.changes) },
        };
      },
    };
  }
  const binding = {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  } as unknown as D1Database;
  return { sqlite, binding };
}
