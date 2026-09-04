import React from 'react'
import { GATEWAY_COMPAT_GROUPS, fieldsInGroup, type GatewayCompatFieldKey, type GatewayCompatGroupId, type GatewayCompatFieldSpec } from '../../compat/gateway/fields.js'
import type { ModelGatewayCompatUpdate, ModelGatewayCompatView, ProviderGatewayCompatView, Translation } from '../types.js'
import { en } from '../locales.js'
import type { Palette } from '../theme.js'
import { iosPalette } from '../theme.js'

export interface GatewayCompatGroupProps {
  readonly groupId: GatewayCompatGroupId
  readonly view: ProviderGatewayCompatView | ModelGatewayCompatView
  readonly onChange: (next: Partial<ModelGatewayCompatUpdate>) => void
  readonly disabled?: boolean
  readonly palette?: Palette
  readonly t?: Translation
}

function defaultTranslation(key: string): string {
  return (en as Record<string, string>)[key] ?? key
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

function fieldOptions(spec: GatewayCompatFieldSpec, t: Translation): readonly { value: string; label: string }[] {
  if (spec.kind === 'boolean') {
    return [
      { value: 'auto', label: t('gatewayCompatAuto') },
      { value: 'supported', label: t('gatewayCompatSupported') },
      { value: 'unsupported', label: t('gatewayCompatUnsupported') },
    ]
  }
  return [
    { value: 'auto', label: t('gatewayCompatAuto') },
    ...spec.enumValues.map((value) => {
      const option = spec.enumOptions?.find((candidate) => candidate.value === value)
      return { value, label: option?.labelKey === undefined ? value : t(option.labelKey) }
    }),
  ]
}

function renderField(
  spec: GatewayCompatFieldSpec,
  view: ProviderGatewayCompatView | ModelGatewayCompatView,
  onChange: GatewayCompatGroupProps['onChange'],
  disabled: boolean,
  palette: Palette,
  t: Translation,
): React.ReactElement {
  const key = spec.key as GatewayCompatFieldKey
  const value = (view as unknown as Record<string, string>)[key] ?? 'auto'
  return <label key={key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(110px, auto)', alignItems: 'center', gap: '7px', minWidth: 0, fontSize: '12px', color: palette.text }}>
    <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{t(spec.labelKey)}</span>
    <select aria-label={t(spec.labelKey)} value={value} disabled={disabled} onChange={(event) => onChange({ [key]: event.currentTarget.value } as Partial<ModelGatewayCompatUpdate>)} style={selectStyle(palette)}>
      {fieldOptions(spec, t).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </label>
}

export function GatewayCompatGroup({ groupId, view, onChange, disabled = false, palette = iosPalette(), t = defaultTranslation }: GatewayCompatGroupProps): React.ReactElement | null {
  const specs = fieldsInGroup(groupId)
  const available = specs.filter((spec) => (view as unknown as Record<string, unknown>)[`${spec.key}Available`] === true)
  if (available.length === 0) return null
  const titleKey = GATEWAY_COMPAT_GROUPS.find((group) => group.id === groupId)?.titleKey ?? groupId
  return <div style={{ display: 'grid', gap: '4px' }}>
    <div style={{ fontSize: '11px', fontWeight: 700, color: palette.secondary }}>{t(titleKey)}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '6px' }}>
      {available.map((spec) => renderField(spec, view, onChange, disabled, palette, t))}
    </div>
  </div>
}
