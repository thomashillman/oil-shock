import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetLocalD1State, resolveLocalD1StateDir } from "../../../scripts/reset-local-d1-state";

describe("resetLocalD1State", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("removes the local D1 state directory when it exists", () => {
    const rootDir = path.resolve("C:/Projects/oil-shock");
    const targetDir = resolveLocalD1StateDir(rootDir);

    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    const rmSpy = vi.spyOn(fs, "rmSync").mockImplementation(() => undefined);

    const message = resetLocalD1State(rootDir);

    expect(rmSpy).toHaveBeenCalledWith(path.resolve(targetDir), { recursive: true, force: true });
    expect(message).toContain("Removed local D1 state");
  });

  it("returns a no-op message when the local D1 state directory is missing", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(false);
    const rmSpy = vi.spyOn(fs, "rmSync");

    const message = resetLocalD1State("C:/Projects/oil-shock");

    expect(rmSpy).not.toHaveBeenCalled();
    expect(message).toBe("No local D1 state directory found. Nothing to reset.");
  });

  it("throws a helpful message when the local D1 state is locked", () => {
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(fs, "rmSync").mockImplementation(() => {
      const error = new Error("locked") as NodeJS.ErrnoException;
      error.code = "EPERM";
      throw error;
    });

    expect(() => resetLocalD1State("C:/Projects/oil-shock")).toThrow(
      /Unable to remove locked local D1 state.*Stop the local worker\/dev servers and retry\./,
    );
  });
});
