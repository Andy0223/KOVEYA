import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { spawn, execFileSync } from "node:child_process";

// Every run gets its own local D1, accounts, sessions and rate-limit buckets.
// Test the built Worker and assets, without development HMR interrupting requests.
mkdirSync(".wrangler", { recursive: true });
const state = mkdtempSync(resolve(".wrangler/e2e-"));
const env = { ...process.env, KOVEYA_TEST_STATE: state };
const run = (args) =>
  execFileSync(process.execPath, args, { env, stdio: "inherit" });
let server;
function cleanup() {
  rmSync(state, { recursive: true, force: true });
}
process.once("exit", cleanup);
try {
  const wrangler = resolve("node_modules/wrangler/bin/wrangler.js");
  run([
    wrangler,
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--persist-to",
    state,
  ]);
  run([
    wrangler,
    "d1",
    "execute",
    "DB",
    "--local",
    "--persist-to",
    state,
    "--file",
    "seeds/demo.sql",
  ]);
  const vite = resolve("node_modules/vite/bin/vite.js");
  run([vite, "build"]);
  server = spawn(
    process.execPath,
    [vite, "preview", "--host", "127.0.0.1", "--port", "4173", "--strictPort"],
    { env, stdio: "inherit" },
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      server.kill(signal);
    });
  server.once("exit", (code) => {
    process.exitCode = code ?? 0;
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
