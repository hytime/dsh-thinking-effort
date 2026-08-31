import { HostContext } from './types.js';
export declare const SETTINGS_NAMESPACE = "llm-pi-ai";
export declare const DEFAULT_LEVELS: {
    readonly off: null;
    readonly high: "high";
    readonly max: "max";
};
export interface ProviderDefaultsResult {
    readonly providers: unknown;
    readonly filled: number;
}
export declare function fillProviderDefaults(providers: unknown): ProviderDefaultsResult;
export declare function installSettingsWatcher(ctx: HostContext): void;
