#!/usr/bin/env tsx
/**
 * Apply all migrations to local D1 database in order.
 * Usage: tsx scripts/apply-all-migrations.ts [--local]
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const isLocal = process.argv.includes("--local");
const flag = isLocal ? "--local" : "--remote";
const rootDir = path.resolve(path.dirname(__filename), "..");

const migrationsDir = path.join(rootDir, "db", "migrations");
const migrations = fs.readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

console.log(`Applying ${migrations.length} migrations ${flag}...`);

for (const migration of migrations) {
  const filePath = path.join(migrationsDir, migration);
  const relPath = path.relative(rootDir, filePath);
  console.log(`\nApplying ${migration}...`);

  try {
    // Run from worker directory where wrangler is installed
    const cmd = [
      "corepack",
      "pnpm",
      "exec",
      "wrangler",
      "d1",
      "execute",
      "energy_dislocation",
      flag,
      "--file",
      `../${relPath}`,
      "--config",
      "../wrangler.jsonc"
    ].join(" ");

    const output = execSync(cmd, {
      stdio: "pipe",
      encoding: "utf-8",
      cwd: path.join(rootDir, "worker")
    });

    if (output.includes("success") && output.includes("true")) {
      console.log(`✓ ${migration} applied successfully`);
    } else if (output.includes("ERROR") || output.includes("error")) {
      console.error(`✗ ${migration} failed:`);
      console.error(output);
      process.exit(1);
    } else {
      console.log(`✓ ${migration} applied`);
    }
  } catch (error) {
    console.error(`✗ Failed to apply ${migration}:`);
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

console.log("\n✓ All migrations applied successfully!");
