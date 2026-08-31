function hasMethods(value, methods) {
    if ((typeof value !== 'object' && typeof value !== 'function') || value === null)
        return false;
    return methods.every((method) => {
        let current = value;
        while (current !== null) {
            const descriptor = Object.getOwnPropertyDescriptor(current, method);
            if (descriptor === undefined) {
                current = Object.getPrototypeOf(current);
                continue;
            }
            return 'value' in descriptor
                ? typeof descriptor.value === 'function'
                : typeof Reflect.get(value, method) === 'function';
        }
        return false;
    });
}
function capabilities(settings, externalLanguages) {
    return { settings, externalLanguages };
}
export function clientCapabilities(input) {
    const settings = hasMethods(input.remoteSettings, ['describe', 'mutate'])
        ? 'remote'
        : hasMethods(input.legacySettings, ['describe', 'mutate'])
            ? 'legacy'
            : 'none';
    return capabilities(settings, typeof input.addLanguage === 'function');
}
export function hostCapabilities(input) {
    const settings = hasMethods(input.settings, ['get', 'update', 'describe'])
        ? 'legacy'
        : 'none';
    return capabilities(settings, false);
}
//# sourceMappingURL=capabilities.js.map