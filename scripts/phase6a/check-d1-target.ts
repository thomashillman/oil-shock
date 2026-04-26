#!/usr/bin/env tsx
/**
 * Read-only Phase 6A D1 target preflight CLI.
 * Generates a Markdown preflight report and exits non-zero if blockers present.
 */

import fs from 'fs/promises';
import path from 'path';
import { analyzeD1Target, D1TargetPreflightResult } from '../../worker/src/phase6a/d1-target-preflight';

// Export for testing
export async function parseArgs(args: string[]): Promise<{ outputPath: string | null; showHelp: boolean }> {
  let outputPath: string | null = null;
  let showHelp = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') {
      if (i + 1 < args.length) {
        outputPath = args[i + 1];
        i++;
      } else {
        throw new Error('--out requires an argument');
      }
    } else if (args[i] === '--help') {
      showHelp = true;
    } else if (args[i].startsWith('-')) {
      throw new Error(`unknown argument: ${args[i]}`);
    }
  }

  return { outputPath, showHelp };
}

export function showHelp(): string {
  return `
Usage: tsx scripts/phase6a/check-d1-target.ts [options]

Options:
  --out <path>    Write report to file (creates parent directories)
  --help          Show this message

The script:
  - Reads wrangler.jsonc from the repo root
  - Checks for required migration files (0014, 0015, 0016)
  - Reports D1 binding configuration and shared ID risks
  - Generates gated migration commands
  - Exits non-zero if blockers are present

Example:
  corepack pnpm phase6a:d1:preflight
  corepack pnpm phase6a:d1:preflight --out /tmp/preflight-report.md
  `;
}

function parseJsonc(content: string): any {
  // Remove full-line comments (lines starting with //)
  let normalized = content
    .split('\n')
    .filter(line => !line.trim().startsWith('//'))
    .join('\n');

  // Remove inline comments (// after content, but avoid inside strings)
  normalized = normalized
    .split('\n')
    .map(line => {
      // Simple inline comment removal: find // that is not in quotes
      const inString = (str: string, pos: number): boolean => {
        let inQuote = false;
        let escape = false;
        for (let i = 0; i < pos; i++) {
          if (escape) {
            escape = false;
            continue;
          }
          if (str[i] === '\\') {
            escape = true;
            continue;
          }
          if (str[i] === '"') {
            inQuote = !inQuote;
          }
        }
        return inQuote;
      };

      let idx = line.indexOf('//');
      while (idx >= 0) {
        if (!inString(line, idx)) {
          return line.substring(0, idx).trimEnd();
        }
        idx = line.indexOf('//', idx + 1);
      }
      return line;
    })
    .join('\n');

  // Remove trailing commas before ] or }
  normalized = normalized.replace(/,(\s*[}\]])/g, '$1');

  try {
    return JSON.parse(normalized);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    throw new Error(`Invalid JSON in wrangler.jsonc: ${error}`);
  }
}

export async function loadWranglerConfig(cwd: string): Promise<any> {
  const wranglerPath = path.resolve(cwd, 'wrangler.jsonc');
  const content = await fs.readFile(wranglerPath, 'utf-8');
  return parseJsonc(content);
}

export async function loadMigrationFiles(cwd: string, requiredMigrations: string[]): Promise<string[]> {
  const existingFiles: string[] = [];
  const dbMigrationsPath = path.resolve(cwd, 'db/migrations');

  for (const filename of requiredMigrations) {
    const filePath = path.join(dbMigrationsPath, filename);
    try {
      await fs.stat(filePath);
      existingFiles.push(filename);
    } catch {
      // File doesn't exist
    }
  }

  return existingFiles;
}

export function generateReport(result: D1TargetPreflightResult): string {
  const lines: string[] = [];

  lines.push('# Phase 6A D1 Target Preflight Report');
  lines.push('');
  lines.push(`**Status**: ${result.status === 'blocked' ? '❌ BLOCKED' : '⚠️  OPERATOR REVIEW REQUIRED'}`);
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');

  // D1 Bindings Summary
  lines.push('## D1 Bindings');
  lines.push('');
  for (const binding of result.d1Bindings) {
    lines.push(`### ${binding.scope}`);
    lines.push(`- Database: ${binding.databaseName}`);
    lines.push(`- ID: \`${binding.databaseId}\``);
    lines.push('');
  }

  // Blockers
  if (result.blockers.length > 0) {
    lines.push('## Blockers');
    lines.push('');
    for (const blocker of result.blockers) {
      lines.push(`- ${blocker}`);
    }
    lines.push('');
  }

  // Warnings
  if (result.warnings.length > 0) {
    lines.push('## Warnings');
    lines.push('');
    for (const warning of result.warnings) {
      lines.push(`- ${warning}`);
    }
    lines.push('');
  }

  // Required Migrations
  lines.push('## Required Migrations');
  lines.push('');
  for (const mig of result.requiredMigrations) {
    const status = mig.present ? '✅' : '❌';
    lines.push(`${status} ${mig.filename}`);
  }
  lines.push('');

  // Migration Commands
  if (result.migrationCommands.length > 0) {
    lines.push('## Next Steps');
    lines.push('');

    if (result.status === 'blocked') {
      lines.push('**Status: BLOCKED** — Do not apply migrations until all blockers are resolved.');
      lines.push('');
    } else {
      lines.push('Once all operator confirmations are complete:');
      lines.push('');
    }

    lines.push('```bash');
    for (const cmd of result.migrationCommands) {
      lines.push(cmd);
    }
    lines.push('```');
    lines.push('');
  }

  // Summary
  lines.push('## Summary');
  lines.push('');
  if (result.status === 'blocked') {
    lines.push('❌ This environment is **not ready** for migrations.');
    lines.push('');
    lines.push('Blockers must be resolved before proceeding:');
    for (const blocker of result.blockers) {
      lines.push(`- ${blocker}`);
    }
  } else {
    lines.push('⚠️  This environment is ready for operator review.');
    lines.push('');
    lines.push('Before applying migrations:');
    lines.push('1. Review blockers and warnings above');
    lines.push('2. Confirm all required migration files are present');
    lines.push('3. Verify D1 target configuration is correct');
    lines.push('4. Apply Cloudflare D1 migrations only after explicit operator confirmation');
  }
  lines.push('');

  return lines.join('\n');
}

export async function runPreflight(
  cwd: string,
  outputPath: string | null
): Promise<{ status: string; exitCode: number }> {
  const wranglerConfig = await loadWranglerConfig(cwd);

  const requiredMigrations = [
    '0014_phase6_pre_deploy_gates.sql',
    '0015_api_health_tracking.sql',
    '0016_add_diesel_crack_feed.sql',
  ];

  const existingFiles = await loadMigrationFiles(cwd, requiredMigrations);

  const result = analyzeD1Target(wranglerConfig, requiredMigrations, {
    existingFiles,
  });

  const report = generateReport(result);

  if (outputPath) {
    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(outputPath, report, 'utf-8');
    console.log(`Preflight report written to: ${outputPath}`);
  } else {
    console.log(report);
  }

  const exitCode = result.status === 'blocked' ? 1 : 0;
  return { status: result.status, exitCode };
}

// Only run CLI if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  (async () => {
    try {
      const { outputPath, showHelp } = await parseArgs(args);

      if (showHelp) {
        console.log(showHelp());
        process.exit(0);
      }

      const result = await runPreflight(process.cwd(), outputPath);
      process.exit(result.exitCode);
    } catch (error) {
      console.error('Preflight check failed:');
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  })();
}
