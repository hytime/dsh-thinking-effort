export function isUnknownRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function isModelEntry(value) {
    return isUnknownRecord(value);
}
export function isProviderProfile(value) {
    return isUnknownRecord(value);
}
export function isSettingsDescriptor(value) {
    return isUnknownRecord(value);
}
export function isAgentRequestPayload(value) {
    return isUnknownRecord(value);
}
export function isAgentRequestConfig(value) {
    return isUnknownRecord(value);
}
//# sourceMappingURL=types.js.map