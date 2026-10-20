export interface Palette {
  readonly canvas: string
  readonly group: string
  readonly raised: string
  readonly field: string
  readonly border: string
  readonly divider: string
  readonly text: string
  readonly secondary: string
  readonly foreground: string
  readonly accent: string
  readonly accentSoft: string
  readonly accentBorder: string
  readonly switchOff: string
  readonly danger: string
  readonly dangerBg: string
  readonly dangerBorder: string
  readonly shadow: string
}

export interface PaletteEnvironment {
  readonly backgroundColor?: string
  readonly prefersDark?: boolean
}

function isDark(environment?: PaletteEnvironment): boolean {
  if (environment?.backgroundColor !== undefined) {
    const values = environment.backgroundColor.match(/\d+(?:\.\d+)?/g)
    const alpha = values && values.length > 3 ? Number(values[3]) : 1
    if (values && values.length >= 3 && alpha > 0) {
      const rgb = values.slice(0, 3).map(Number)
      return (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722) < 145
    }
  }
  if (environment?.prefersDark !== undefined) return environment.prefersDark
  return true
}

export function iosPalette(environment?: PaletteEnvironment): Palette {
  let dark = true
  if (environment === undefined) {
    try {
      const body = typeof document === 'undefined' ? undefined : document.body
      const backgroundColor = body === undefined ? undefined : getComputedStyle(body).backgroundColor
      const prefersDark = typeof window === 'undefined' || typeof window.matchMedia !== 'function'
        ? undefined
        : window.matchMedia('(prefers-color-scheme: dark)').matches
      dark = isDark({ backgroundColor, prefersDark })
    } catch {
      dark = true
    }
  } else {
    dark = isDark(environment)
  }
  return dark
    ? {
        canvas: 'var(--dsw-alias-bg-base, #1C1C1E)',
        group: 'var(--dsw-alias-bg-layer-1, #2C2C2E)',
        raised: 'var(--dsw-alias-bg-layer-2, #3A3A3C)',
        field: 'var(--dsw-specific-input-major, #2C2C2E)',
        border: 'var(--dsw-alias-border-l2, rgba(255,255,255,0.12))',
        divider: 'var(--dsw-alias-border-l1, rgba(255,255,255,0.10))',
        text: 'var(--dsw-alias-label-primary, #F5F5F7)',
        secondary: 'var(--dsw-alias-label-secondary, rgba(235,235,245,0.60))',
        foreground: 'var(--dsw-alias-label-primary-foreground, #FFFFFF)',
        accent: 'var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary, #0A84FF))',
        accentSoft: 'var(--dsw-alias-state-business-tertiary, rgba(10,132,255,0.16))',
        accentBorder: 'var(--dsw-alias-state-business-primary, rgba(10,132,255,0.42))',
        switchOff: 'var(--dsw-alias-bg-layer-3, #39393D)',
        danger: 'var(--dsw-alias-state-error-primary, #FF453A)',
        dangerBg: 'var(--dsw-alias-state-error-tertiary, rgba(255,69,58,0.16))',
        dangerBorder: 'var(--dsw-alias-state-error-primary, rgba(255,69,58,0.30))',
        shadow: 'var(--dsw-shadow-lv1, 0 1px 1px rgba(0,0,0,0.24))',
      }
    : {
        canvas: 'var(--dsw-alias-bg-base, #F2F2F7)',
        group: 'var(--dsw-alias-bg-layer-1, #FFFFFF)',
        raised: 'var(--dsw-alias-bg-layer-2, #F9F9FB)',
        field: 'var(--dsw-specific-input-major, #F2F2F7)',
        border: 'var(--dsw-alias-border-l2, rgba(60,60,67,0.18))',
        divider: 'var(--dsw-alias-border-l1, rgba(60,60,67,0.18))',
        text: 'var(--dsw-alias-label-primary, #1C1C1E)',
        secondary: 'var(--dsw-alias-label-secondary, #6D6D72)',
        foreground: 'var(--dsw-alias-label-primary-foreground, #FFFFFF)',
        accent: 'var(--dsw-alias-button-primary-fill, var(--dsw-alias-brand-primary, #007AFF))',
        accentSoft: 'var(--dsw-alias-state-business-tertiary, rgba(0,122,255,0.10))',
        accentBorder: 'var(--dsw-alias-state-business-primary, rgba(0,122,255,0.32))',
        switchOff: 'var(--dsw-alias-bg-layer-3, #E5E5EA)',
        danger: 'var(--dsw-alias-state-error-primary, #FF3B30)',
        dangerBg: 'var(--dsw-alias-state-error-tertiary, rgba(255,59,48,0.12))',
        dangerBorder: 'var(--dsw-alias-state-error-primary, rgba(255,59,48,0.28))',
        shadow: 'var(--dsw-shadow-lv1, 0 1px 1px rgba(0,0,0,0.05))',
      }
}
