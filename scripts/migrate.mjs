#!/usr/bin/env node
import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const mode = process.argv[2];
if (mode !== "local" && mode !== "remote") {
  console.error("Usage: node scripts/migrate.mjs <local|remote>");
  process.exit(1);
}

function run(label, cmd, cwd) {
  console.log(`\n→ ${label}`);
  try {
    execSync(cmd, { cwd, stdio: "inherit" });
    console.log(`✓ ${label}`);
  } catch {
    console.error(`✗ ${label} failed`);
    process.exit(1);
  }
}

const apiDir = resolve(root, "packages/api");
const authDir = resolve(root, "packages/auth");

if (mode === "local") {
  run(
    "API local migrations",
    "npx wrangler d1 migrations apply cubedocs-main --local --persist-to ../../.wrangler/state",
    apiDir
  );
  run(
    "Auth local migrations",
    "npx wrangler d1 migrations apply cubedocs-auth --local --persist-to ../../.wrangler/state",
    authDir
  );
} else {
  run(
    "API remote migrations",
    "npx wrangler d1 migrations apply cubedocs-main --remote",
    apiDir
  );
  run(
    "Auth remote migrations",
    "npx wrangler d1 migrations apply cubedocs-auth --remote",
    authDir
  );
}

console.log("\nAll migrations complete.");
