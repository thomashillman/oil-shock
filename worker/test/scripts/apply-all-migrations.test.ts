import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMigrationCommand, runMigrations } from "../../../scripts/apply-all-migrations";

describe("apply-all-migrations", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds the local wrangler migration command explicitly", () => {
    expect(buildMigrationCommand(true)).toBe(
      "corepack pnpm exec wrangler d1 migrations apply energy_dislocation --local --config ../wrangler.jsonc",
    );
    expect(buildMigrationCommand(false)).toBe(
      "corepack pnpm exec wrangler d1 migrations apply energy_dislocation --remote --config ../wrangler.jsonc",
    );
  });

  it("executes wrangler from the worker directory and logs the migration count", () => {
    const rootDir = path.resolve("C:/Projects/oil-shock");
    const exec = vi.fn(() => "done") as unknown as NonNullable<Parameters<typeof runMigrations>[0]["exec"]>;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(fs, "readdirSync").mockReturnValue(["0001_init.sql", "0002_fix.sql", "notes.txt"] as never);

    const output = runMigrations({ isLocal: true, exec, rootDir });

    expect(output).toBe("done");
    expect(exec).toHaveBeenCalledWith(
      buildMigrationCommand(true),
      expect.objectContaining({
        cwd: path.join(rootDir, "worker"),
        stdio: "pipe",
        encoding: "utf-8",
      }),
    );
    expect(logSpy).toHaveBeenCalledWith("Applying pending migrations with --local...");
    expect(logSpy).toHaveBeenCalledWith("Found 2 migration files in db/migrations.");
  });

  it("wraps wrangler failures with a recovery hint", () => {
    const rootDir = path.resolve("C:/Projects/oil-shock");
    const exec = vi.fn(() => {
      throw new Error("duplicate column name: dislocation_state_json");
    }) as unknown as NonNullable<Parameters<typeof runMigrations>[0]["exec"]>;
    vi.spyOn(fs, "readdirSync").mockReturnValue(["0001_init.sql", "0002_fix.sql"] as never);
    vi.spyOn(console, "log").mockImplementation(() => {});

    let caught: unknown;
    try {
      runMigrations({ isLocal: true, exec, rootDir });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain(
      "Failed to apply local D1 migrations using corepack pnpm exec wrangler d1 migrations apply energy_dislocation --local --config ../wrangler.jsonc."
    );
    expect((caught as Error).message).toContain(
      'If the local database is stale or locked, stop the Worker dev server, run "corepack pnpm db:migrate:local:reset", and retry.'
    );
  });
});
