import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { promises as fsPromises } from 'fs';
import os from 'os';
import {
  parseArgs,
  showHelp,
  generateReport,
  loadWranglerConfig,
  loadMigrationFiles,
  runPreflight,
} from '../../../scripts/phase6a/check-d1-target';
import { analyzeD1Target } from '../../src/phase6a/d1-target-preflight';

describe('D1 Target Preflight CLI', () => {
  describe('parseArgs', () => {
    it('parses --help', async () => {
      const { outputPath, showHelp: help } = await parseArgs(['--help']);
      expect(help).toBe(true);
      expect(outputPath).toBe(null);
    });

    it('parses --out <path>', async () => {
      const { outputPath } = await parseArgs(['--out', '/tmp/report.md']);
      expect(outputPath).toBe('/tmp/report.md');
    });

    it('throws on --out without value', async () => {
      try {
        await parseArgs(['--out']);
        expect.fail('should have thrown');
      } catch (e) {
        expect(e instanceof Error && e.message.includes('requires an argument')).toBe(true);
      }
    });

    it('throws on unknown argument', async () => {
      try {
        await parseArgs(['--unknown']);
        expect.fail('should have thrown');
      } catch (e) {
        expect(e instanceof Error && e.message.includes('unknown argument')).toBe(true);
      }
    });
  });

  describe('showHelp', () => {
    it('returns help text', () => {
      const help = showHelp();
      expect(help.includes('Usage:')).toBe(true);
      expect(help.includes('--out')).toBe(true);
      expect(help.includes('--help')).toBe(true);
    });
  });

  describe('generateReport', () => {
    it('generates report with blocked status and withheld commands', () => {
      const result = analyzeD1Target(
        {
          d1_databases: [
            {
              binding: 'DB',
              database_name: 'energy_dislocation',
              database_id: 'shared-id',
            },
          ],
          env: {
            preview: {
              d1_databases: [
                {
                  binding: 'DB',
                  database_name: 'energy_dislocation',
                  database_id: 'shared-id',
                },
              ],
            },
            production: {
              d1_databases: [
                {
                  binding: 'DB',
                  database_name: 'energy_dislocation',
                  database_id: 'shared-id',
                },
              ],
            },
          },
        },
        [
          '0014_phase6_pre_deploy_gates.sql',
          '0015_api_health_tracking.sql',
          '0016_add_diesel_crack_feed.sql',
        ],
        {
          existingFiles: [
            '0014_phase6_pre_deploy_gates.sql',
            '0015_api_health_tracking.sql',
            '0016_add_diesel_crack_feed.sql',
          ],
        }
      );

      const report = generateReport(result);
      expect(report.includes('BLOCKED')).toBe(true);
      expect(report.includes('## D1 Bindings')).toBe(true);
      expect(report.includes('## Blockers')).toBe(true);
      expect(report.includes('withheld')).toBe(true);
      expect(report.includes('db:migrate:local')).toBe(false);
    });

    it('generates report with preview-only migration command when ready', () => {
      const result = analyzeD1Target(
        {
          d1_databases: [
            {
              binding: 'DB',
              database_name: 'energy_dislocation',
              database_id: 'root-id',
            },
          ],
          env: {
            preview: {
              d1_databases: [
                {
                  binding: 'DB',
                  database_name: 'energy_dislocation',
                  database_id: 'preview-id',
                },
              ],
            },
            production: {
              d1_databases: [
                {
                  binding: 'DB',
                  database_name: 'energy_dislocation',
                  database_id: 'prod-id',
                },
              ],
            },
          },
        },
        [
          '0014_phase6_pre_deploy_gates.sql',
          '0015_api_health_tracking.sql',
          '0016_add_diesel_crack_feed.sql',
        ],
        {
          existingFiles: [
            '0014_phase6_pre_deploy_gates.sql',
            '0015_api_health_tracking.sql',
            '0016_add_diesel_crack_feed.sql',
          ],
        }
      );

      const report = generateReport(result);
      expect(report.includes('OPERATOR REVIEW REQUIRED')).toBe(true);
      expect(report.includes('--env preview')).toBe(true);
      expect(report.includes('--env production')).toBe(false);
      expect(report.includes('out of scope')).toBe(true);
      expect(report.includes('db:migrate:local')).toBe(false);
    });

    it('does not show withheld commands when blocked', () => {
      const result = analyzeD1Target(
        {
          d1_databases: [
            { binding: 'DB', database_name: 'db', database_id: 'shared' },
          ],
          env: {
            preview: { d1_databases: [{ binding: 'DB', database_name: 'db', database_id: 'shared' }] },
            production: { d1_databases: [{ binding: 'DB', database_name: 'db', database_id: 'shared' }] },
          },
        },
        ['0014_phase6_pre_deploy_gates.sql', '0015_api_health_tracking.sql', '0016_add_diesel_crack_feed.sql'],
        { existingFiles: ['0014_phase6_pre_deploy_gates.sql', '0015_api_health_tracking.sql', '0016_add_diesel_crack_feed.sql'] }
      );

      const report = generateReport(result);
      expect(report.includes('withheld')).toBe(true);
    });
  });

  describe('loadWranglerConfig', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'test-'));
    });

    afterEach(async () => {
      try {
        await fsPromises.rm(tempDir, { recursive: true });
      } catch {
        // Already removed
      }
    });

    it('loads and parses wrangler.jsonc with inline comments', async () => {
      const wranglerPath = path.join(tempDir, 'wrangler.jsonc');
      const content = `{
  "d1_databases": [
    {
      "binding": "DB",  // The binding name
      "database_name": "test_db", // Database name
      "database_id": "test-id"
    }
  ],
  "env": {
    "preview": {
      // Preview environment config
      "d1_databases": [
        {
          "binding": "DB",
          "database_name": "test_db",
          "database_id": "preview-id"
        }
      ]
    }
  }
}`;

      await fs.writeFile(wranglerPath, content, 'utf-8');
      const config = await loadWranglerConfig(tempDir);

      expect(config.d1_databases).toBeDefined();
      expect(config.d1_databases[0].binding).toBe('DB');
      expect(config.env.preview.d1_databases[0].database_id).toBe('preview-id');
    });

    it('parses JSONC with trailing commas', async () => {
      const wranglerPath = path.join(tempDir, 'wrangler.jsonc');
      const content = `{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "test_db",
      "database_id": "test-id",
    }
  ],
}`;

      await fs.writeFile(wranglerPath, content, 'utf-8');
      const config = await loadWranglerConfig(tempDir);

      expect(config.d1_databases).toBeDefined();
      expect(config.d1_databases[0].database_id).toBe('test-id');
    });

    it('fails on malformed JSON', async () => {
      const wranglerPath = path.join(tempDir, 'wrangler.jsonc');
      const content = `{ broken json }`;

      await fs.writeFile(wranglerPath, content, 'utf-8');

      try {
        await loadWranglerConfig(tempDir);
        expect.fail('should have thrown');
      } catch (e) {
        expect(e instanceof Error && e.message.includes('Invalid JSON')).toBe(true);
      }
    });
  });

  describe('loadMigrationFiles', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'test-'));
    });

    afterEach(async () => {
      try {
        await fsPromises.rm(tempDir, { recursive: true });
      } catch {
        // Already removed
      }
    });

    it('finds existing migration files', async () => {
      const migrationsDir = path.join(tempDir, 'db/migrations');
      await fsPromises.mkdir(migrationsDir, { recursive: true });

      // Create some migration files
      await fs.writeFile(path.join(migrationsDir, '0014_phase6_pre_deploy_gates.sql'), '');
      await fs.writeFile(path.join(migrationsDir, '0015_api_health_tracking.sql'), '');

      const existing = await loadMigrationFiles(tempDir, [
        '0014_phase6_pre_deploy_gates.sql',
        '0015_api_health_tracking.sql',
        '0016_add_diesel_crack_feed.sql',
      ]);

      expect(existing).toContain('0014_phase6_pre_deploy_gates.sql');
      expect(existing).toContain('0015_api_health_tracking.sql');
      expect(existing).not.toContain('0016_add_diesel_crack_feed.sql');
    });

    it('returns empty array when no migrations exist', async () => {
      const migrationsDir = path.join(tempDir, 'db/migrations');
      await fsPromises.mkdir(migrationsDir, { recursive: true });

      const existing = await loadMigrationFiles(tempDir, [
        '0014_phase6_pre_deploy_gates.sql',
        '0015_api_health_tracking.sql',
        '0016_add_diesel_crack_feed.sql',
      ]);

      expect(existing).toEqual([]);
    });
  });

  describe('runPreflight', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'test-'));
    });

    afterEach(async () => {
      try {
        await fsPromises.rm(tempDir, { recursive: true });
      } catch {
        // Already removed
      }
    });

    it('exits with non-zero when preview/production share D1 ID', async () => {
      const wranglerPath = path.join(tempDir, 'wrangler.jsonc');
      const migrationsDir = path.join(tempDir, 'db/migrations');

      await fsPromises.mkdir(migrationsDir, { recursive: true });

      // Create migration files
      await fs.writeFile(path.join(migrationsDir, '0014_phase6_pre_deploy_gates.sql'), '');
      await fs.writeFile(path.join(migrationsDir, '0015_api_health_tracking.sql'), '');
      await fs.writeFile(path.join(migrationsDir, '0016_add_diesel_crack_feed.sql'), '');

      // Shared D1 config
      const content = `{
  "d1_databases": [
    { "binding": "DB", "database_name": "db", "database_id": "root-id" }
  ],
  "env": {
    "preview": {
      "d1_databases": [
        { "binding": "DB", "database_name": "db", "database_id": "shared-id" }
      ]
    },
    "production": {
      "d1_databases": [
        { "binding": "DB", "database_name": "db", "database_id": "shared-id" }
      ]
    }
  }
}`;

      await fs.writeFile(wranglerPath, content, 'utf-8');

      const result = await runPreflight(tempDir, null);
      expect(result.exitCode).toBe(1);
      expect(result.status).toBe('blocked');
    });

    it('exits with zero when D1 IDs are separate and migrations present', async () => {
      const wranglerPath = path.join(tempDir, 'wrangler.jsonc');
      const migrationsDir = path.join(tempDir, 'db/migrations');

      await fsPromises.mkdir(migrationsDir, { recursive: true });

      // Create migration files
      await fs.writeFile(path.join(migrationsDir, '0014_phase6_pre_deploy_gates.sql'), '');
      await fs.writeFile(path.join(migrationsDir, '0015_api_health_tracking.sql'), '');
      await fs.writeFile(path.join(migrationsDir, '0016_add_diesel_crack_feed.sql'), '');

      // Separate D1 config
      const content = `{
  "d1_databases": [
    { "binding": "DB", "database_name": "db", "database_id": "root-id" }
  ],
  "env": {
    "preview": {
      "d1_databases": [
        { "binding": "DB", "database_name": "db", "database_id": "preview-id" }
      ]
    },
    "production": {
      "d1_databases": [
        { "binding": "DB", "database_name": "db", "database_id": "prod-id" }
      ]
    }
  }
}`;

      await fs.writeFile(wranglerPath, content, 'utf-8');

      const result = await runPreflight(tempDir, null);
      expect(result.exitCode).toBe(0);
      expect(result.status).toBe('ready_for_operator_review');
    });

    it('writes report to --out path and creates parent directories', async () => {
      const wranglerPath = path.join(tempDir, 'wrangler.jsonc');
      const migrationsDir = path.join(tempDir, 'db/migrations');
      const reportPath = path.join(tempDir, 'reports/2026-04/preflight.md');

      await fsPromises.mkdir(migrationsDir, { recursive: true });

      // Create migration files
      await fs.writeFile(path.join(migrationsDir, '0014_phase6_pre_deploy_gates.sql'), '');
      await fs.writeFile(path.join(migrationsDir, '0015_api_health_tracking.sql'), '');
      await fs.writeFile(path.join(migrationsDir, '0016_add_diesel_crack_feed.sql'), '');

      const content = `{
  "d1_databases": [
    { "binding": "DB", "database_name": "db", "database_id": "root-id" }
  ],
  "env": {
    "preview": {
      "d1_databases": [
        { "binding": "DB", "database_name": "db", "database_id": "preview-id" }
      ]
    },
    "production": {
      "d1_databases": [
        { "binding": "DB", "database_name": "db", "database_id": "prod-id" }
      ]
    }
  }
}`;

      await fs.writeFile(wranglerPath, content, 'utf-8');

      await runPreflight(tempDir, reportPath);

      // Verify file was created
      const reportContent = await fs.readFile(reportPath, 'utf-8');
      expect(reportContent.includes('# Phase 6A D1 Target Preflight Report')).toBe(true);
      expect(reportContent.includes('OPERATOR REVIEW REQUIRED')).toBe(true);
    });
  });
});
