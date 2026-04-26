import { describe, it, expect } from 'vitest';
import {
  analyzeD1Target,
  PreflightStatus,
  D1TargetPreflightResult,
} from '../../src/phase6a/d1-target-preflight';

describe('D1 Target Preflight Analyser', () => {
  describe('Critical: preview-production sharing', () => {
    it('blocks when preview and production share the same D1 ID', () => {
      const wranglerConfig = {
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
      ], {
        existingFiles: [
          '0014_phase6_pre_deploy_gates.sql',
          '0015_api_health_tracking.sql',
          '0016_add_diesel_crack_feed.sql',
        ],
      });

      expect(result.status).toBe('blocked');
      expect(result.blockers.some((b) => b.includes('preview and production') && b.includes('shared'))).toBe(true);
      expect(result.blockers.some((b) => b.includes('CRITICAL'))).toBe(true);
    });

    it('blocks when all three (root, preview, production) share the same D1 ID', () => {
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
      ], {
        existingFiles: [
          '0014_phase6_pre_deploy_gates.sql',
          '0015_api_health_tracking.sql',
          '0016_add_diesel_crack_feed.sql',
        ],
      });

      expect(result.status).toBe('blocked');
      expect(result.blockers.some((b) => b.includes('shared'))).toBe(true);
    });
  });

  describe('Warnings for root sharing', () => {
    it('warns when root and preview share the same D1 ID', () => {
      const wranglerConfig = {
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
                database_id: 'different-id',
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
        ],
      });

      expect(result.warnings.some((w) => w.includes('root and preview'))).toBe(true);
    });

    it('warns when root and production share the same D1 ID', () => {
      const wranglerConfig = {
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
                database_id: 'different-id',
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
        ],
      });

      expect(result.warnings.some((w) => w.includes('root and production'))).toBe(true);
    });
  });

  describe('Missing D1 bindings', () => {
    it('blocks when preview is missing DB binding', () => {
      const wranglerConfig = {
        d1_databases: [
          {
            binding: 'DB',
            database_name: 'energy_dislocation',
            database_id: 'root-id',
          },
        ],
        env: {
          preview: {
            d1_databases: [], // missing DB binding
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
        ],
      });

      expect(result.status).toBe('blocked');
      expect(result.blockers.some((b) => b.includes('preview') && b.includes('missing'))).toBe(true);
    });

    it('blocks when production is missing DB binding', () => {
      const wranglerConfig = {
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
            d1_databases: [], // missing DB binding
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
        ],
      });

      expect(result.status).toBe('blocked');
      expect(result.blockers.some((b) => b.includes('production') && b.includes('missing'))).toBe(true);
    });
  });

  describe('Separate D1 targets', () => {
    it('does not block when all D1 targets are different and bindings present', () => {
      const wranglerConfig = {
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
                database_id: 'production-id',
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
        ],
      });

      expect(result.status).toBe('ready_for_operator_review');
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
                database_id: 'production-id',
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

  describe('APP_ENV mismatch with expectedAppEnv', () => {
    it('warns when APP_ENV does not match expectedAppEnv', () => {
      const wranglerConfig = {
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
            expectedAppEnv: 'preview',
            runtimeMode: 'oilshock',
          },
        }
      );

      expect(result.warnings.some((w) => w.includes('APP_ENV'))).toBe(true);
      expect(result.warnings.some((w) => w.includes('local'))).toBe(true);
      expect(result.warnings.some((w) => w.includes('preview'))).toBe(true);
    });

    it('does not warn when APP_ENV matches expectedAppEnv', () => {
      const wranglerConfig = {
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
            APP_ENV: 'preview',
            expectedAppEnv: 'preview',
            runtimeMode: 'oilshock',
          },
        }
      );

      expect(result.warnings.some((w) => w.includes('APP_ENV'))).toBe(false);
    });
  });

  describe('Migration commands', () => {
    it('shows preview-only migration command when no blockers', () => {
      const wranglerConfig = {
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

      expect(result.migrationCommands.length).toBeGreaterThan(0);
      expect(result.migrationCommands.some((c) => c.includes('--env preview'))).toBe(true);
      expect(result.migrationCommands.some((c) => c.includes('--env production'))).toBe(false);
      expect(result.migrationCommands.some((c) => c.includes('out of scope'))).toBe(true);
      expect(result.migrationCommands.some((c) => c.includes('db:migrate:local'))).toBe(false);
      expect(result.migrationCommands.some((c) => c.includes('CRITICAL'))).toBe(true);
    });

    it('withholds migration commands when blockers present', () => {
      const wranglerConfig = {
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

      expect(result.migrationCommands.some((c) => c.includes('withheld'))).toBe(true);
      expect(result.migrationCommands.some((c) => c.includes('blockers'))).toBe(true);
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

      const result1 = analyzeD1Target(wranglerConfig, requiredMigrations, {
        existingFiles: requiredMigrations,
      });
      const result2 = analyzeD1Target(wranglerConfig, requiredMigrations, {
        existingFiles: requiredMigrations,
      });

      expect(JSON.stringify(result1)).toBe(JSON.stringify(result2));
    });
  });

  describe('DB binding selection', () => {
    it('correctly finds DB binding when it is not the first in array', () => {
      const wranglerConfig = {
        d1_databases: [
          {
            binding: 'OTHER',
            database_name: 'other_db',
            database_id: 'other-id',
          },
          {
            binding: 'DB',
            database_name: 'energy_dislocation',
            database_id: 'correct-id',
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

      // Should use the DB binding, not the OTHER binding
      expect(result.d1Bindings.find((b) => b.scope === 'root')?.databaseId).toBe('correct-id');
      expect(result.d1Bindings.find((b) => b.scope === 'root')?.databaseName).toBe('energy_dislocation');
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
