import { readFileSync, readdirSync } from "node:fs";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parse } from "yaml";

function walk(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((e) => {
    if (
      [
        ".git",
        ".wrangler",
        "node_modules",
        "dist",
        "test-results",
        "playwright-report",
      ].includes(e.name)
    )
      return [];
    return e.isDirectory() ? walk(`${path}/${e.name}`) : [`${path}/${e.name}`];
  });
}
const files = walk(".");
const spec = JSON.parse(readFileSync("01_PRODUCT/requirements.json", "utf8"));
const seen = new Set();
for (const m of spec.modules)
  for (const r of m.requirements) {
    if (
      seen.has(r.id) ||
      !/^[A-Z]+-\d{3}$/.test(r.id) ||
      !["P0", "P1", "P2", "P3"].includes(r.priority) ||
      !r.acceptance_criteria
    )
      throw new Error(`Invalid requirement ${r.id}`);
    seen.add(r.id);
  }
if (seen.size !== 173 || spec.modules.length !== 15)
  throw new Error(
    "Unexpected requirement coverage; review baseline before changing count.",
  );
const master = readFileSync("01_PRODUCT/Master_PRD.md", "utf8");
for (const id of seen)
  if (!master.includes(`| ${id} |`))
    throw new Error(`Master PRD missing ${id}`);
for (const module of spec.modules)
  for (const requirement of module.requirements) {
    const row = master
      .split("\n")
      .find((line) => line.startsWith(`| ${requirement.id} |`));
    if (
      !row?.includes(
        `${requirement.implementation_status} / ${requirement.acceptance_status}`,
      )
    )
      throw new Error(`Stale requirement status: ${requirement.id}`);
  }
for (const file of files.filter((f) => f.endsWith(".md"))) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].split("#")[0];
    if (!target || /^(https?:|mailto:)/.test(target)) continue;
    if (!existsSync(resolve(dirname(file), target)))
      throw new Error(`Broken link in ${file}: ${target}`);
  }
}
const api = parse(readFileSync("03_TECH/API_Specification.yaml", "utf8"));
if (api.openapi !== "3.1.0" || !api.paths["/providers/{slug}"])
  throw new Error("Missing OpenAPI contract.");
function checkReferences(value) {
  if (!value || typeof value !== "object") return;
  if (typeof value.$ref === "string" && value.$ref.startsWith("#/")) {
    const target = value.$ref
      .slice(2)
      .split("/")
      .reduce((parent, key) => parent?.[key], api);
    if (!target) throw new Error(`Broken OpenAPI reference: ${value.$ref}`);
  }
  for (const child of Object.values(value)) checkReferences(child);
}
checkReferences(api);
console.log(
  `Documentation links, OpenAPI YAML, and ${seen.size} requirement IDs verified.`,
);
