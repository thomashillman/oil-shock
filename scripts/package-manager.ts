export interface PackageManagerLauncher {
  command: string;
  args: string[];
}

export function resolvePackageManagerLauncher(): PackageManagerLauncher {
  const execPath = process.env.npm_execpath;
  if (!execPath) {
    return { command: "pnpm", args: [] };
  }

  if (execPath.endsWith(".cjs") || execPath.endsWith(".js") || execPath.endsWith(".mjs")) {
    return { command: process.execPath, args: [execPath] };
  }

  return { command: execPath, args: [] };
}
