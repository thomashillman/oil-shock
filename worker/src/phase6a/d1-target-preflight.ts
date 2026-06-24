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
  expectedAppEnv?: 'preview' | 'production' | string;
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

  // Extract D1 bindings by looking for the "DB" binding specifically
  const findDBBinding = (databases: any[] | undefined) => {
    return databases?.find((db) => db.binding === 'DB') || databases?.[0];
  };

  const rootBinding = findDBBinding(wranglerConfig.d1_databases);
  const previewBinding = findDBBinding(wranglerConfig.env?.preview?.d1_databases);
  const productionBinding = findDBBinding(wranglerConfig.env?.production?.d1_databases);

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

  // Check for unsafe D1 ID sharing patterns
  // CRITICAL: preview and production must never share the same D1 ID
  if (previewBinding && productionBinding) {
    if (previewBinding.database_id === productionBinding.database_id) {
      blockers.push(
        `shared D1 target (CRITICAL): preview and production both use database_id ${previewBinding.database_id}. ` +
        'Migrations would affect both environments. Operator must confirm intended target and reconfigure D1 bindings before proceeding.'
      );
    }
  }

  // WARN: root sharing with preview or production (less critical but still risky)
  if (rootBinding && previewBinding && rootBinding.database_id === previewBinding.database_id) {
    warnings.push(
      `shared D1 target: root and preview both use database_id ${rootBinding.database_id}. ` +
      'Local and preview environments share the same database.'
    );
  }

  if (rootBinding && productionBinding && rootBinding.database_id === productionBinding.database_id) {
    warnings.push(
      `shared D1 target: root and production both use database_id ${rootBinding.database_id}. ` +
      'Local and production environments share the same database.'
    );
  }

  // Check that preview and production have the DB binding
  if (!previewBinding) {
    blockers.push('preview environment missing D1 database binding "DB"');
  }

  if (!productionBinding) {
    blockers.push('production environment missing D1 database binding "DB"');
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
    const { APP_ENV, expectedAppEnv, runtimeMode } = context.healthEvidence;
    if (expectedAppEnv && APP_ENV && APP_ENV !== expectedAppEnv) {
      warnings.push(
        `APP_ENV mismatch: health evidence reports APP_ENV=${APP_ENV} but expected ${expectedAppEnv}. ` +
        `(runtimeMode=${runtimeMode || 'unknown'}). ` +
        'Verify Worker environment variables are configured correctly before applying migrations.'
      );
    }
  }

  // Generate gated migration commands for Cloudflare D1
  // Only show commands if no critical blockers (preview-production sharing, missing bindings, missing migrations)
  // Phase 6A Step 0B focuses on preview/staging telemetry verification, not production migration
  if (blockers.length === 0) {
    migrationCommands.push(
      '# CRITICAL: Do not run until D1 target is confirmed',
      '# Apply migrations to Cloudflare D1 preview environment:',
      '# wrangler d1 migrations apply energy_dislocation --env preview',
      '',
      '# Production migrations are intentionally out of scope for this pre-canary verification step.'
    );
  } else {
    migrationCommands.push(
      '# Migration commands withheld: resolve blockers above before attempting to apply migrations.'
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
