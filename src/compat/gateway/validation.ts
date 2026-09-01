import type { DshVersionCapabilities, GatewayCompatEditableField } from '../version-map.js'
import type { GatewayCompatEditability, GatewayCompatValidationResult } from './types.js'

const editableFields = ['supportsDeveloperRole', 'maxTokensField'] as const

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function hasProperty(value: unknown, key: string): boolean {
  const object = record(value)
  return object !== undefined && Object.prototype.hasOwnProperty.call(object, key)
}

function schemaProperties(value: unknown): Record<string, unknown> | undefined {
  const object = record(value)
  if (!object) return undefined
  const properties = record(object.properties)
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

function versionAllowsField(
  capabilities: DshVersionCapabilities | undefined,
  field: GatewayCompatEditableField,
): boolean {
  return capabilities !== undefined && capabilities.gatewayCompatFields.includes(field)
}

export function editableProviderCompatFields(
  capabilities: DshVersionCapabilities | undefined,
  descriptorSchema: unknown,
): GatewayCompatEditability {
  const supportsDeveloperRole = versionAllowsField(capabilities, 'supportsDeveloperRole')
    && schemaAllowsField(descriptorSchema, 'supportsDeveloperRole')
  const maxTokensField = versionAllowsField(capabilities, 'maxTokensField')
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
  capabilities: DshVersionCapabilities | undefined,
  descriptorSchema: unknown,
): GatewayCompatValidationResult {
  const fields = editableProviderCompatFields(capabilities, descriptorSchema)
  return {
    ...fields,
    available: fields.editableFields.length === editableFields.length,
  }
}

export function canEditProviderCompatField(
  capabilities: DshVersionCapabilities | undefined,
  descriptorSchema: unknown,
  field: GatewayCompatEditableField,
): boolean {
  return editableProviderCompatFields(capabilities, descriptorSchema)[field]
}

export const providerCompatEditability = editableProviderCompatFields
