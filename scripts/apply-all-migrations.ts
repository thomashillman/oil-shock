#!/usr/bin/env tsx

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export interface MigrationRunOptions {
  isLocal: boolean;
  exec?: typeof execSync;
  rootDir?: string;
}

export function buildMigrationCommand(isLocal: boolean): string {
  const flag = isLocal ? "--local" : "--remote";
  return [
    "corepack",
    "pnpm",
    "exec",
    "wrangler",
    "d1",
    "migrations",
    "apply",
    "energy_dislocation",
    flag,
    "--config",
    "../wrangler.jsonc"
  ].join(" ");
}

function formatRelativePath(rootDir: string, targetDir: string): string {
  return path.relative(rootDir, targetDir).split(path.sep).join("/");
}

export function runMigrations(options: MigrationRunOptions): string {
  const rootDir = options.rootDir ?? path.resolve(path.dirname(__filename), "..");
  const flag = options.isLocal ? "--local" : "--remote";
  const migrationsDir = path.join(rootDir, "db", "migrations");
  const relativeMigrationsDir = formatRelativePath(rootDir, migrationsDir);
  const migrationFiles = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  console.log(`Applying pending migrations with ${flag}...`);
  console.log(`Found ${migrationFiles.length} migration files in ${relativeMigrationsDir}.`);

  const command = buildMigrationCommand(options.isLocal);
  const exec = options.exec ?? execSync;
  try {
    return exec(command, {
      stdio: "pipe",
      encoding: "utf-8",
      cwd: path.join(rootDir, "worker")
    });
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(
      [
        `Failed to apply ${options.isLocal ? "local" : "remote"} D1 migrations using ${command}.`,
        `Scanned ${migrationFiles.length} migration file(s) from ${relativeMigrationsDir}.`,
        `Cause: ${cause}`,
        'If the local database is stale or locked, stop the Worker dev server, run "corepack pnpm db:migrate:local:reset", and retry.'
      ].join(" ")
    );
  }
}

export async function main(): Promise<void> {
  try {
    const output = runMigrations({ isLocal: process.argv.includes("--local") });
    process.stdout.write(output);
    console.log("\n? Migration apply completed");
  } catch (error) {
    console.error("? Migration apply failed:");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
