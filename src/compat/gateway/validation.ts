import type { DshVersionCapabilities, GatewayCompatEditableField } from '../version-map.js'
import type { GatewayCompatEditability, GatewayCompatValidationResult } from './types.js'

const editableFields = ['supportsDeveloperRole', 'maxTokensField'] as const
type RuntimeProfile = 'modern' | 'legacy' | 'unknown'
type EditabilityCapabilities = DshVersionCapabilities | RuntimeProfile

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function hasProperty(value: unknown, key: string): boolean {
  const object = record(value)
  return object !== undefined && Object.prototype.hasOwnProperty.call(object, key)
}

function dereference(value: unknown, refs: Record<string, unknown> | undefined): unknown {
  let current = value
  const seen = new Set<string>()
  while (typeof current === 'number' && refs !== undefined) {
    const key = String(current)
    if (seen.has(key) || !Object.prototype.hasOwnProperty.call(refs, key)) return undefined
    seen.add(key)
    current = refs[key]
  }
  return current
}

function schemaNodeAtPath(schema: unknown, path: readonly string[]): Record<string, unknown> | undefined {
  const envelope = record(schema)
  const refs = record(envelope?.refs)
  let node: unknown = refs !== undefined && envelope?.uid !== undefined
    ? refs[String(envelope.uid)]
    : schema

  for (const key of path) {
    const object = record(dereference(node, refs))
    if (object === undefined) return undefined
    const properties = record(object.dict) ?? record(object.properties)
    const child = key === '*'
      ? object.additionalProperties ?? properties?.['*']
      : properties?.[key]
    const next = child ?? (object.type === 'dict' || object.type === 'array' ? object.inner : undefined)
    node = dereference(next, refs)
  }

  return record(dereference(node, refs))
}

function schemaProperties(value: unknown): Record<string, unknown> | undefined {
  const object = record(value)
  if (!object) return undefined
  const properties = record(object.properties) ?? record(object.dict)
  if (properties) return properties
  const schema = record(object.schema)
  if (schema) return schemaProperties(schema)
  const inner = record(object.inner)
  if (inner) return schemaProperties(inner)
  const objectSchema = record(object.object)
  if (objectSchema) return schemaProperties(objectSchema)
  const additionalProperties = record(object.additionalProperties)
  if (additionalProperties) return schemaProperties(additionalProperties)
  const items = record(object.items)
  if (items) return schemaProperties(items)
  return undefined
}

function compatProperties(schema: unknown): Record<string, unknown> | undefined {
  const pathNode = schemaNodeAtPath(schema, ['providers', '*', 'compat'])
  const pathProperties = schemaProperties(pathNode)
  if (pathProperties && editableFields.some((field) => hasProperty(pathProperties, field))) return pathProperties

  const direct = schemaProperties(schema)
  if (direct && editableFields.some((field) => hasProperty(direct, field))) return direct

  const providers = direct?.providers
  const providerProperties = schemaProperties(providers)
  const compat = providerProperties?.compat
  const nested = schemaProperties(compat)
  if (nested) return nested

  const descriptor = record(schema)
  if (!descriptor) return undefined
  for (const key of ['schema', 'value', 'descriptor']) {
    const nestedResult = compatProperties(descriptor[key])
    if (nestedResult) return nestedResult
  }
  return undefined
}

function schemaAllowsField(schema: unknown, field: GatewayCompatEditableField): boolean {
  const properties = compatProperties(schema)
  return properties !== undefined && hasProperty(properties, field)
}

function runtimeAllowsField(
  capabilities: EditabilityCapabilities | undefined,
  field: GatewayCompatEditableField,
): boolean {
  if (capabilities === 'modern' || capabilities === 'legacy') return true
  if (capabilities === 'unknown' || capabilities === undefined || capabilities === null || typeof capabilities !== 'object') return false
  return Array.isArray(capabilities.gatewayCompatFields) && capabilities.gatewayCompatFields.includes(field)
}

export function editableProviderCompatFields(
  capabilities: EditabilityCapabilities | undefined,
  descriptorSchema: unknown,
): GatewayCompatEditability {
  const supportsDeveloperRole = runtimeAllowsField(capabilities, 'supportsDeveloperRole')
    && schemaAllowsField(descriptorSchema, 'supportsDeveloperRole')
  const maxTokensField = runtimeAllowsField(capabilities, 'maxTokensField')
    && schemaAllowsField(descriptorSchema, 'maxTokensField')
  const editableFieldsResult = editableFields.filter((field) => (
    field === 'supportsDeveloperRole' ? supportsDeveloperRole : maxTokensField
  ))
  return {
    supportsDeveloperRole,
    maxTokensField,
    editableFields: editableFieldsResult,
  }
}

export function validateProviderCompat(
  capabilities: EditabilityCapabilities | undefined,
  descriptorSchema: unknown,
): GatewayCompatValidationResult {
  const fields = editableProviderCompatFields(capabilities, descriptorSchema)
  return {
    ...fields,
    available: fields.editableFields.length === editableFields.length,
  }
}

export function canEditProviderCompatField(
  capabilities: EditabilityCapabilities | undefined,
  descriptorSchema: unknown,
  field: GatewayCompatEditableField,
): boolean {
  return editableProviderCompatFields(capabilities, descriptorSchema)[field]
}

export const providerCompatEditability = editableProviderCompatFields
