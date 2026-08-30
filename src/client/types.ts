export type CompatibilityProfile = 'legacy' | 'modern' | 'unknown'

export type CompatibilitySettings = 'legacy' | 'remote' | 'none'

export interface DshCompatibilityCapabilities {
  readonly settings: CompatibilitySettings
  readonly externalLanguages: boolean
}

export type CompatibilityDiagnosticCode = 'invalid-version' | 'version-capability-mismatch'

export interface CompatibilityDiagnostic {
  readonly code: CompatibilityDiagnosticCode
  readonly version?: string
  readonly expectedProfile?: Exclude<CompatibilityProfile, 'unknown'>
  readonly actualCapabilities: DshCompatibilityCapabilities
  readonly message: string
}
