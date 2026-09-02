import React from 'react'
import type { ModelGatewayCompatUpdate, ModelGatewayCompatView, ProviderGatewayCompatView, Translation } from '../types.js'
import { en } from '../locales.js'
import type { Palette } from '../theme.js'
import { iosPalette } from '../theme.js'

interface ProviderGatewayCompatControlsProps {
  readonly scope?: 'provider'
  readonly view: ProviderGatewayCompatView
  readonly onChange: (next: ProviderGatewayCompatView) => void
  readonly disabled?: boolean
}

interface ModelGatewayCompatControlsProps {
  readonly scope: 'model'
  readonly view: ModelGatewayCompatView
  readonly onChange: (next: Partial<ModelGatewayCompatUpdate>) => void
  readonly disabled?: boolean
}

export type GatewayCompatControlsProps = ProviderGatewayCompatControlsProps | ModelGatewayCompatControlsProps

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

function sourceKey(source: ModelGatewayCompatView['supportsDeveloperRoleSource']): string {
  const keys: Record<ModelGatewayCompatView['supportsDeveloperRoleSource'], string> = {
    model: 'compatSourceModel',
    provider: 'compatSourceProvider',
    base: 'compatSourceProtocol',
    catalog: 'compatSourceCatalog',
    protocol: 'compatSourceProtocol',
    unknown: 'compatSourceUnknown',
  }
  return keys[source]
}

function sourceLabel(t: Translation, source: ModelGatewayCompatView['supportsDeveloperRoleSource']): string {
  return t(sourceKey(source))
}

function isModelView(scope: GatewayCompatControlsProps['scope'], view: GatewayCompatControlsProps['view']): view is ModelGatewayCompatView {
  return scope === 'model'
    && 'model' in view
}

export function renderGatewayCompatControls(
  { scope = 'provider', view, onChange, disabled = false }: GatewayCompatControlsProps,
  { palette, t }: GatewayCompatControlsPresentation,
): React.ReactElement | null {
  if (!view.supportsDeveloperRoleAvailable && !view.maxTokensFieldAvailable) return null
  const modelView = isModelView(scope, view)
  const patch = (next: Partial<ModelGatewayCompatUpdate>): void => {
    if (modelView) (onChange as (value: Partial<ModelGatewayCompatUpdate>) => void)(next)
    else (onChange as (value: ProviderGatewayCompatView) => void)({ ...view, ...next } as ProviderGatewayCompatView)
  }
  const fieldSource = (source: ModelGatewayCompatView['supportsDeveloperRoleSource']): React.ReactElement => <span style={{ color: palette.secondary, fontSize: '10px', fontWeight: 500 }}>({sourceLabel(t, source)})</span>
  return <div data-provider={view.provider} data-scope={modelView ? 'model' : 'provider'} style={{ display: 'grid', gap: '5px', marginBottom: '4px', padding: '6px 8px', border: `1px solid ${palette.border}`, borderRadius: '8px', backgroundColor: palette.group }}>
    <div style={{ display: 'grid', gap: '2px', fontSize: '12px', fontWeight: 700, color: palette.text }}>
      <span>{t(modelView ? 'modelGatewayCompatTitle' : 'gatewayCompatTitle')}</span>
      {modelView ? <span style={{ fontSize: '11px', fontWeight: 600, overflowWrap: 'anywhere' }}>{view.model}</span> : null}
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '6px' }}>
      {view.supportsDeveloperRoleAvailable ? <label style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(110px, auto)', alignItems: 'center', gap: '7px', minWidth: 0, fontSize: '12px', color: palette.text }}><span style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, flexWrap: 'wrap' }}><span>{t('supportsDeveloperRole')}</span>{modelView ? fieldSource(view.supportsDeveloperRoleSource) : null}</span><select aria-label={t('supportsDeveloperRole')} value={view.supportsDeveloperRole} disabled={disabled} onChange={(event) => patch({ supportsDeveloperRole: event.currentTarget.value as ModelGatewayCompatView['supportsDeveloperRole'] })} style={selectStyle(palette)}><option value="auto">{t('gatewayCompatAuto')}</option><option value="supported">{t('gatewayCompatSupported')}</option><option value="unsupported">{t('gatewayCompatUnsupported')}</option></select></label> : null}
      {view.maxTokensFieldAvailable ? <label style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(110px, auto)', alignItems: 'center', gap: '7px', minWidth: 0, fontSize: '12px', color: palette.text }}><span style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 0, flexWrap: 'wrap' }}><span>{t('maxTokensField')}</span>{modelView ? fieldSource(view.maxTokensFieldSource) : null}</span><select aria-label={t('maxTokensField')} value={view.maxTokensField} disabled={disabled} onChange={(event) => patch({ maxTokensField: event.currentTarget.value as ModelGatewayCompatView['maxTokensField'] })} style={selectStyle(palette)}><option value="auto">{t('gatewayCompatAuto')}</option><option value="max_tokens">{t('maxTokensFieldStandard')}</option><option value="max_completion_tokens">{t('maxTokensFieldCompletion')}</option></select></label> : null}
    </div>
    {modelView ? <div style={{ color: palette.secondary, fontSize: '10px' }}>{t('inheritProviderCompat')}</div> : null}
  </div>
}

export function GatewayCompatControls(props: GatewayCompatControlsProps): React.ReactElement | null {
  return renderGatewayCompatControls(props, { palette: iosPalette(), t: defaultTranslation })
}
