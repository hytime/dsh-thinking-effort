import React from 'react'
import type { ProviderGatewayCompatView, Translation } from '../types.js'
import { en } from '../locales.js'
import type { Palette } from '../theme.js'
import { iosPalette } from '../theme.js'

export interface GatewayCompatControlsProps {
  readonly view: ProviderGatewayCompatView
  readonly onChange: (next: ProviderGatewayCompatView) => void
  readonly disabled?: boolean
}

export interface GatewayCompatControlsPresentation {
  readonly palette: Palette
  readonly t: Translation
}

function selectStyle(palette: Palette): React.CSSProperties {
  return {
    boxSizing: 'border-box',
    minWidth: 0,
    height: '28px',
    padding: '0 7px',
    border: `1px solid ${palette.border}`,
    borderRadius: '8px',
    backgroundColor: palette.group,
    color: palette.text,
    fontSize: '12px',
  }
}

function defaultTranslation(key: string): string {
  return (en as Record<string, string>)[key] ?? key
}

export function renderGatewayCompatControls(
  { view, onChange, disabled = false }: GatewayCompatControlsProps,
  { palette, t }: GatewayCompatControlsPresentation,
): React.ReactElement | null {
  if (!view.supportsDeveloperRoleAvailable && !view.maxTokensFieldAvailable) return null
  const patch = (next: Partial<ProviderGatewayCompatView>): void => onChange({ ...view, ...next })
  return <div data-provider={view.provider} style={{ display: 'grid', gap: '5px', marginBottom: '4px', padding: '6px 8px', border: `1px solid ${palette.border}`, borderRadius: '8px', backgroundColor: palette.group }}>
    <div style={{ fontSize: '12px', fontWeight: 700, color: palette.text }}>{t('gatewayCompatTitle')}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '6px' }}>
      {view.supportsDeveloperRoleAvailable ? <label style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(110px, auto)', alignItems: 'center', gap: '7px', minWidth: 0, fontSize: '12px', color: palette.text }}><span>{t('supportsDeveloperRole')}</span><select aria-label={t('supportsDeveloperRole')} value={view.supportsDeveloperRole} disabled={disabled} onChange={(event) => patch({ supportsDeveloperRole: event.currentTarget.value as ProviderGatewayCompatView['supportsDeveloperRole'] })} style={selectStyle(palette)}><option value="auto">{t('gatewayCompatAuto')}</option><option value="supported">{t('gatewayCompatSupported')}</option><option value="unsupported">{t('gatewayCompatUnsupported')}</option></select></label> : null}
      {view.maxTokensFieldAvailable ? <label style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(110px, auto)', alignItems: 'center', gap: '7px', minWidth: 0, fontSize: '12px', color: palette.text }}><span>{t('maxTokensField')}</span><select aria-label={t('maxTokensField')} value={view.maxTokensField} disabled={disabled} onChange={(event) => patch({ maxTokensField: event.currentTarget.value as ProviderGatewayCompatView['maxTokensField'] })} style={selectStyle(palette)}><option value="auto">{t('gatewayCompatAuto')}</option><option value="max_tokens">{t('maxTokensFieldStandard')}</option><option value="max_completion_tokens">{t('maxTokensFieldCompletion')}</option></select></label> : null}
    </div>
  </div>
}

export function GatewayCompatControls(props: GatewayCompatControlsProps): React.ReactElement | null {
  return renderGatewayCompatControls(props, { palette: iosPalette(), t: defaultTranslation })
}
