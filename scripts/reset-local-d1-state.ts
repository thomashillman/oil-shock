#!/usr/bin/env tsx

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function resolveLocalD1StateDir(rootDir: string): string {
  return path.join(rootDir, ".wrangler", "state", "v3", "d1", "miniflare-D1DatabaseObject");
}

export function resetLocalD1State(rootDir?: string): string {
  const workspaceRoot = path.resolve(rootDir ?? path.resolve(path.dirname(__filename), ".."));
  const resolvedTarget = path.resolve(resolveLocalD1StateDir(workspaceRoot));

  if (!resolvedTarget.startsWith(workspaceRoot + path.sep)) {
    throw new Error(`Refusing to delete outside the workspace: ${resolvedTarget}`);
  }

  if (!fs.existsSync(resolvedTarget)) {
    return "No local D1 state directory found. Nothing to reset.";
  }

  try {
    fs.rmSync(resolvedTarget, { recursive: true, force: true });
    return `Removed local D1 state at ${resolvedTarget}`;
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "EPERM") {
      throw new Error(`Unable to remove locked local D1 state at ${resolvedTarget}. Stop the local worker/dev servers and retry.`);
    }

    throw error;
  }
}

export async function main(): Promise<void> {
  try {
    console.log(resetLocalD1State());
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
