import { describe, it, expect } from 'vitest';
import {
  analyzeD1Target,
  PreflightStatus,
  D1TargetPreflightResult,
} from '../../src/phase6a/d1-target-preflight';

describe('D1 Target Preflight Analyser', () => {
  describe('Shared D1 target detection', () => {
    it('detects when root, preview, and production share the same D1 ID', () => {
      const wranglerConfig = {
        d1_databases: [
          {
            binding: 'DB',
            database_name: 'energy_dislocation',
            database_id: '9db64b68-6ffc-4be2-a2c6-667691a5801f',
          },
        ],
        env: {
          preview: {
            d1_databases: [
              {
                binding: 'DB',
                database_name: 'energy_dislocation',
                database_id: '9db64b68-6ffc-4be2-a2c6-667691a5801f',
              },
            ],
          },
          production: {
            d1_databases: [
              {
                binding: 'DB',
                database_name: 'energy_dislocation',
                database_id: '9db64b68-6ffc-4be2-a2c6-667691a5801f',
              },
            ],
          },
        },
      };

      const result = analyzeD1Target(wranglerConfig, [
        '0014_phase6_pre_deploy_gates.sql',
        '0015_api_health_tracking.sql',
        '0016_add_diesel_crack_feed.sql',
      ]);

      expect(result.status).toBe('blocked');
      expect(result.blockers.some((b) => b.includes('shared'))).toBe(true);
    });
  });

  describe('Separate D1 targets', () => {
    it('does not block solely because D1 targets are different', () => {
      const wranglerConfig = {
        d1_databases: [
          {
            binding: 'DB',
            database_name: 'energy_dislocation',
            database_id: 'local-db-id',
          },
        ],
        env: {
          preview: {
            d1_databases: [
              {
                binding: 'DB',
                database_name: 'energy_dislocation',
                database_id: 'preview-db-id',
              },
            ],
          },
          production: {
            d1_databases: [
              {
                binding: 'DB',
                database_name: 'energy_dislocation',
                database_id: 'production-db-id',
              },
            ],
          },
        },
      };

      const result = analyzeD1Target(wranglerConfig, [
        '0014_phase6_pre_deploy_gates.sql',
        '0015_api_health_tracking.sql',
        '0016_add_diesel_crack_feed.sql',
      ]);

      // Should still be blocked because migrations are required, but not because of sharing
      expect(result.blockers.some((b) => b.includes('shared'))).toBe(false);
    });
  });

  describe('Missing required migration files', () => {
    it('blocks when required migration files are missing', () => {
      const wranglerConfig = {
        d1_databases: [
          {
            binding: 'DB',
            database_name: 'energy_dislocation',
            database_id: 'different-id',
          },
        ],
        env: {
          preview: {
            d1_databases: [
              {
                binding: 'DB',
                database_name: 'energy_dislocation',
                database_id: 'preview-db-id',
              },
            ],
          },
        },
      };

      const result = analyzeD1Target(wranglerConfig, [
        '0014_phase6_pre_deploy_gates.sql',
        '0015_api_health_tracking.sql',
        '0016_add_diesel_crack_feed.sql',
      ], {
        existingFiles: [
          '0014_phase6_pre_deploy_gates.sql',
          // 0015 and 0016 missing
        ]
      });

      expect(result.status).toBe('blocked');
      expect(result.blockers.some((b) => b.includes('missing'))).toBe(true);
      expect(result.requiredMigrations.some(m => m.filename === '0015_api_health_tracking.sql' && !m.present)).toBe(true);
      expect(result.requiredMigrations.some(m => m.filename === '0016_add_diesel_crack_feed.sql' && !m.present)).toBe(true);
    });
  });

  describe('Required migrations present', () => {
    it('marks migrations as present when they exist', () => {
      const wranglerConfig = {
        d1_databases: [
          {
            binding: 'DB',
            database_name: 'energy_dislocation',
            database_id: 'preview-db-id',
          },
        ],
        env: {
          production: {
            d1_databases: [
              {
                binding: 'DB',
                database_name: 'energy_dislocation',
                database_id: 'production-db-id',
              },
            ],
          },
        },
      };

      const result = analyzeD1Target(wranglerConfig, [
        '0014_phase6_pre_deploy_gates.sql',
        '0015_api_health_tracking.sql',
        '0016_add_diesel_crack_feed.sql',
      ], {
        existingFiles: [
          '0014_phase6_pre_deploy_gates.sql',
          '0015_api_health_tracking.sql',
          '0016_add_diesel_crack_feed.sql',
        ]
      });

      expect(result.requiredMigrations.every(m => m.present)).toBe(true);
    });
  });

  describe('APP_ENV mismatch', () => {
    it('warns when health evidence shows APP_ENV=local for preview URL', () => {
      const wranglerConfig = {
        d1_databases: [
          {
            binding: 'DB',
            database_name: 'energy_dislocation',
            database_id: 'preview-db-id',
          },
        ],
        env: {
          preview: {
            d1_databases: [
              {
                binding: 'DB',
                database_name: 'energy_dislocation',
                database_id: 'preview-db-id',
              },
            ],
          },
        },
      };

      const result = analyzeD1Target(
        wranglerConfig,
        ['0014_phase6_pre_deploy_gates.sql', '0015_api_health_tracking.sql', '0016_add_diesel_crack_feed.sql'],
        {
          existingFiles: [
            '0014_phase6_pre_deploy_gates.sql',
            '0015_api_health_tracking.sql',
            '0016_add_diesel_crack_feed.sql',
          ],
          healthEvidence: {
            APP_ENV: 'local',
            runtimeMode: 'preview',
          },
        }
      );

      expect(result.warnings.some((w) => w.includes('APP_ENV'))).toBe(true);
      expect(result.warnings.some((w) => w.includes('local'))).toBe(true);
    });
  });

  describe('Conservative migration command generation', () => {
    it('generates migration commands as commented, gated section only', () => {
      const wranglerConfig = {
        d1_databases: [
          {
            binding: 'DB',
            database_name: 'energy_dislocation',
            database_id: 'preview-db-id',
          },
        ],
        env: {
          preview: {
            d1_databases: [
              {
                binding: 'DB',
                database_name: 'energy_dislocation',
                database_id: 'preview-db-id',
              },
            ],
          },
        },
      };

      const result = analyzeD1Target(
        wranglerConfig,
        ['0014_phase6_pre_deploy_gates.sql', '0015_api_health_tracking.sql', '0016_add_diesel_crack_feed.sql'],
        {
          existingFiles: [
            '0014_phase6_pre_deploy_gates.sql',
            '0015_api_health_tracking.sql',
            '0016_add_diesel_crack_feed.sql',
          ],
        }
      );

      // Commands should exist but be marked as commented/gated
      expect(result.migrationCommands.length).toBeGreaterThan(0);
      expect(result.migrationCommands.every(c => c.includes('#') || c.includes('Do not run'))).toBe(true);
    });
  });

  describe('Deterministic output', () => {
    it('produces identical output for identical input', () => {
      const wranglerConfig = {
        d1_databases: [
          {
            binding: 'DB',
            database_name: 'energy_dislocation',
            database_id: '9db64b68-6ffc-4be2-a2c6-667691a5801f',
          },
        ],
        env: {
          preview: {
            d1_databases: [
              {
                binding: 'DB',
                database_name: 'energy_dislocation',
                database_id: '9db64b68-6ffc-4be2-a2c6-667691a5801f',
              },
            ],
          },
          production: {
            d1_databases: [
              {
                binding: 'DB',
                database_name: 'energy_dislocation',
                database_id: '9db64b68-6ffc-4be2-a2c6-667691a5801f',
              },
            ],
          },
        },
      };

      const requiredMigrations = [
        '0014_phase6_pre_deploy_gates.sql',
        '0015_api_health_tracking.sql',
        '0016_add_diesel_crack_feed.sql',
      ];

      const result1 = analyzeD1Target(wranglerConfig, requiredMigrations);
      const result2 = analyzeD1Target(wranglerConfig, requiredMigrations);

      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });
  });

  describe('Result shape', () => {
    it('returns expected structure', () => {
      const wranglerConfig = {
        d1_databases: [
          {
            binding: 'DB',
            database_name: 'energy_dislocation',
            database_id: 'test-id',
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
        },
      };

      const result = analyzeD1Target(wranglerConfig, [
        '0014_phase6_pre_deploy_gates.sql',
        '0015_api_health_tracking.sql',
        '0016_add_diesel_crack_feed.sql',
      ], {
        existingFiles: [
          '0014_phase6_pre_deploy_gates.sql',
          '0015_api_health_tracking.sql',
          '0016_add_diesel_crack_feed.sql',
        ]
      });

      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('blockers');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('requiredMigrations');
      expect(result).toHaveProperty('d1Bindings');
      expect(result).toHaveProperty('migrationCommands');

      expect(typeof result.status).toBe('string');
      expect(Array.isArray(result.blockers)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(Array.isArray(result.requiredMigrations)).toBe(true);
      expect(Array.isArray(result.d1Bindings)).toBe(true);
      expect(Array.isArray(result.migrationCommands)).toBe(true);
    });
  });
});
