import React from 'react'
import type { ProviderGatewayCompatView, Translation } from '../types.js'
import { en } from '../locales.js'
import type { Palette } from '../theme.js'

export interface GatewayCompatControlsProps {
  readonly view: ProviderGatewayCompatView
  readonly onChange: (next: ProviderGatewayCompatView) => void
  readonly disabled?: boolean
  readonly palette?: Palette
  readonly t?: Translation
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

export function GatewayCompatControls({ view, onChange, disabled = false, palette, t }: GatewayCompatControlsProps): React.ReactElement | null {
  if (!view.supportsDeveloperRoleAvailable && !view.maxTokensFieldAvailable) return null
  const translate: Translation = t ?? ((key) => (en as Record<string, string>)[key] ?? key)
  const colors = palette ?? {
    group: 'transparent',
    border: 'currentColor',
    text: 'currentColor',
  } as Palette
  const patch = (next: Partial<ProviderGatewayCompatView>): void => onChange({ ...view, ...next })
  return <div data-provider={view.provider} style={{ display: 'grid', gap: '5px', marginBottom: '4px', padding: '6px 8px', border: `1px solid ${colors.border}`, borderRadius: '8px', backgroundColor: colors.group }}>
    <div style={{ fontSize: '12px', fontWeight: 700, color: colors.text }}>{translate('gatewayCompatTitle')}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '6px' }}>
      {view.supportsDeveloperRoleAvailable ? <label style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(110px, auto)', alignItems: 'center', gap: '7px', minWidth: 0, fontSize: '12px', color: colors.text }}><span>{translate('supportsDeveloperRole')}</span><select aria-label={translate('supportsDeveloperRole')} value={view.supportsDeveloperRole} disabled={disabled} onChange={(event) => patch({ supportsDeveloperRole: event.currentTarget.value as ProviderGatewayCompatView['supportsDeveloperRole'] })} style={selectStyle(colors)}><option value="auto">{translate('gatewayCompatAuto')}</option><option value="supported">{translate('gatewayCompatSupported')}</option><option value="unsupported">{translate('gatewayCompatUnsupported')}</option></select></label> : null}
      {view.maxTokensFieldAvailable ? <label style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(110px, auto)', alignItems: 'center', gap: '7px', minWidth: 0, fontSize: '12px', color: colors.text }}><span>{translate('maxTokensField')}</span><select aria-label={translate('maxTokensField')} value={view.maxTokensField} disabled={disabled} onChange={(event) => patch({ maxTokensField: event.currentTarget.value as ProviderGatewayCompatView['maxTokensField'] })} style={selectStyle(colors)}><option value="auto">{translate('gatewayCompatAuto')}</option><option value="max_tokens">{translate('maxTokensFieldStandard')}</option><option value="max_completion_tokens">{translate('maxTokensFieldCompletion')}</option></select></label> : null}
    </div>
  </div>
}
