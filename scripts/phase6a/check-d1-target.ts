#!/usr/bin/env tsx
/**
 * Read-only Phase 6A D1 target preflight CLI.
 * Generates a Markdown preflight report and exits non-zero if blockers present.
 */

import fs from 'fs/promises';
import path from 'path';
import { analyzeD1Target } from '../../worker/src/phase6a/d1-target-preflight';

async function main() {
  const args = process.argv.slice(2);
  let outputPath: string | null = null;

  // Parse --out argument
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out' && i + 1 < args.length) {
      outputPath = args[i + 1];
      i++;
    } else if (args[i] === '--help') {
      console.log(`
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
      `);
      process.exit(0);
    }
  }

  try {
    // Read wrangler.jsonc from repo root
    const wranglerPath = path.resolve(process.cwd(), 'wrangler.jsonc');
    const wranglerContent = await fs.readFile(wranglerPath, 'utf-8');

    // Parse JSONC (simple approach: remove comments)
    const jsonContent = wranglerContent
      .split('\n')
      .filter(line => !line.trim().startsWith('//'))
      .join('\n');

    let wranglerConfig: any;
    try {
      wranglerConfig = JSON.parse(jsonContent);
    } catch (e) {
      console.error('Failed to parse wrangler.jsonc:');
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }

    // Determine which migration files exist
    const requiredMigrations = [
      '0014_phase6_pre_deploy_gates.sql',
      '0015_api_health_tracking.sql',
      '0016_add_diesel_crack_feed.sql',
    ];

    const existingFiles: string[] = [];
    const dbMigrationsPath = path.resolve(process.cwd(), 'db/migrations');

    for (const filename of requiredMigrations) {
      const filePath = path.join(dbMigrationsPath, filename);
      try {
        await fs.stat(filePath);
        existingFiles.push(filename);
      } catch {
        // File doesn't exist
      }
    }

    // Analyze D1 target
    const result = analyzeD1Target(wranglerConfig, requiredMigrations, {
      existingFiles,
    });

    // Generate Markdown report
    const report = generateReport(result);

    // Write report
    if (outputPath) {
      const dir = path.dirname(outputPath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(outputPath, report, 'utf-8');
      console.log(`Preflight report written to: ${outputPath}`);
    } else {
      console.log(report);
    }

    // Exit with appropriate code
    if (result.status === 'blocked') {
      process.exit(1);
    }
    process.exit(0);
  } catch (error) {
    console.error('Preflight check failed:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

function generateReport(result: any): string {
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

  // Shared Database Warning
  if (result.blockers.some((b: string) => b.includes('shared'))) {
    lines.push('## ⚠️  WARNING: Shared D1 Database');
    lines.push('');
    lines.push(
      'Root, preview, and production environments are configured to use the same D1 database ID. ' +
      'Applying migrations without explicit confirmation could corrupt the wrong environment.'
    );
    lines.push('');
    lines.push('**Action Required**: Confirm intended migration target before proceeding.');
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
    }

    lines.push('Once D1 target is confirmed and all blockers are resolved:');
    lines.push('');
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
    lines.push('1. Verify intended D1 target (confirm no shared ID misconfiguration)');
    lines.push('2. Confirm all required migration files are present');
    lines.push('3. Review warnings above');
    lines.push('4. Run migration commands only after explicit confirmation');
  }
  lines.push('');

  return lines.join('\n');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
