import { clientCapabilities } from '../compat/capabilities.js';
import { resolveCompatibility } from '../compat/version-adapter.js';
export function directResult(response) {
    if (response !== null && typeof response === 'object' && 'result' in response) {
        const result = response.result;
        if (result !== null && typeof result === 'object')
            return result;
    }
    return response;
}
export function settingsBridge(connection, remoteSettings) {
    const legacySettings = connection?.api?.settings;
    const capabilities = clientCapabilities({ remoteSettings, legacySettings });
    const compatibility = resolveCompatibility({ capabilities });
    if (compatibility.profile === 'modern' && remoteSettings !== undefined) {
        const modern = remoteSettings;
        return {
            describe: () => modern.describe().then((response) => directResult(response)),
            mutate: (ns, ops, expectedRevision) => modern
                .mutate(ns, ops, expectedRevision)
                .then((response) => directResult(response)),
        };
    }
    if (compatibility.profile === 'legacy' && legacySettings !== undefined) {
        const legacy = legacySettings;
        return {
            describe: () => legacy.describe({}).then((response) => directResult(response)),
            mutate: (ns, ops, expectedRevision) => legacy
                .mutate({ ns, ops, expectedRevision })
                .then((response) => directResult(response)),
        };
    }
    return undefined;
}
//# sourceMappingURL=settings-bridge.js.map