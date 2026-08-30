import { describe, expect, it } from 'vitest'
import { resolveCompatibility } from '../src/compat/version-adapter.ts'

describe('compatibility baseline', () => {
  it('classifies the current alpha capabilities as modern', () => {
    expect(resolveCompatibility({
      version: '0.1.2-alpha.1',
      capabilities: { settings: 'remote', externalLanguages: true },
    }).profile).toBe('modern')
  })
})
