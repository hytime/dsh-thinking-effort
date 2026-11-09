/** The legacy-data migration feature: scan, offer, apply, and roll back. */
export { installLegacyMigration, defaultFiles } from './watcher.js'
export type { LegacyMigrationFiles } from './watcher.js'
export { applyLegacyMigration, opsForCandidates, rollbackSnapshot } from './apply.js'
export type { RollbackSnapshotInput } from './apply.js'
export { scanLegacyData, signatureOf, LEGACY_MIGRATION_SOURCES } from './scan.js'
export type { LegacyScan, LegacyScanInput } from './scan.js'
export { LEGACY_LLM_SHAPE, LEGACY_OWN_SHAPE, leavesOf } from './shape.js'
export type { LegacyLeaf, LegacyShape } from './shape.js'
