/**
 * Pure D1 target preflight analyser.
 * No file I/O, no network calls, no migrations applied.
 * Accepts injected input for testing.
 */

export type PreflightStatus = 'ready_for_operator_review' | 'blocked';

export interface D1Binding {
  scope: 'root' | 'preview' | 'production' | string;
  databaseName: string;
  databaseId: string;
}

export interface RequiredMigration {
  filename: string;
  present: boolean;
}

export interface D1TargetPreflightResult {
  status: PreflightStatus;
  blockers: string[];
  warnings: string[];
  requiredMigrations: RequiredMigration[];
  d1Bindings: D1Binding[];
  migrationCommands: string[];
}

export interface HealthEvidence {
  APP_ENV?: string;
  runtimeMode?: string;
}

export interface AnalysisContext {
  existingFiles?: string[];
  healthEvidence?: HealthEvidence;
}

/**
 * Analyze D1 target configuration and migration readiness.
 * Pure function: no side effects, deterministic output.
 */
export function analyzeD1Target(
  wranglerConfig: any,
  requiredMigrations: string[],
  context?: AnalysisContext
): D1TargetPreflightResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const requiredMigrationResults: RequiredMigration[] = [];
  const d1Bindings: D1Binding[] = [];
  const migrationCommands: string[] = [];

  // Extract D1 bindings from config
  const rootBinding = wranglerConfig.d1_databases?.[0];
  const previewBinding = wranglerConfig.env?.preview?.d1_databases?.[0];
  const productionBinding = wranglerConfig.env?.production?.d1_databases?.[0];

  if (rootBinding) {
    d1Bindings.push({
      scope: 'root',
      databaseName: rootBinding.database_name,
      databaseId: rootBinding.database_id,
    });
  }

  if (previewBinding) {
    d1Bindings.push({
      scope: 'preview',
      databaseName: previewBinding.database_name,
      databaseId: previewBinding.database_id,
    });
  }

  if (productionBinding) {
    d1Bindings.push({
      scope: 'production',
      databaseName: productionBinding.database_name,
      databaseId: productionBinding.database_id,
    });
  }

  // Check for shared D1 IDs
  const uniqueIds = new Set([
    rootBinding?.database_id,
    previewBinding?.database_id,
    productionBinding?.database_id,
  ]);

  if (uniqueIds.size < 3 && previewBinding && productionBinding && rootBinding) {
    const sharedId = rootBinding.database_id === previewBinding.database_id &&
                     previewBinding.database_id === productionBinding.database_id;
    if (sharedId) {
      blockers.push(
        `shared D1 target: root, preview, and production all use database_id ${rootBinding.database_id}. ` +
        'Operator must confirm intended migration target before proceeding.'
      );
    }
  }

  // Check migration files
  const existingFiles = context?.existingFiles || [];
  for (const migrationFile of requiredMigrations) {
    const present = existingFiles.includes(migrationFile);
    requiredMigrationResults.push({ filename: migrationFile, present });
    if (!present) {
      blockers.push(`required migration file missing: ${migrationFile}`);
    }
  }

  // Check APP_ENV mismatch
  if (context?.healthEvidence) {
    const { APP_ENV, runtimeMode } = context.healthEvidence;
    if (APP_ENV === 'local' && runtimeMode === 'preview') {
      warnings.push(
        `APP_ENV mismatch: health evidence reports APP_ENV=local for runtime_mode=preview. ` +
        'Verify preview Worker is configured correctly before applying migrations.'
      );
    }
  }

  // Generate gated migration commands
  if (blockers.length === 0) {
    migrationCommands.push(
      '# Do not run until D1 target is confirmed',
      '# corepack pnpm db:migrate:local'
    );
  }

  // Determine status
  const status: PreflightStatus = blockers.length > 0 ? 'blocked' : 'ready_for_operator_review';

  return {
    status,
    blockers,
    warnings,
    requiredMigrations: requiredMigrationResults,
    d1Bindings,
    migrationCommands,
  };
}
