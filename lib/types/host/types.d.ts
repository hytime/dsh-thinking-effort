export type UnknownRecord = Record<string, unknown>;
export interface ModelEntry extends UnknownRecord {
    readonly id?: unknown;
    readonly reasoningEfforts?: unknown;
}
export interface ProviderProfile extends UnknownRecord {
    readonly models?: unknown;
    readonly modelOverrides?: unknown;
}
export interface SettingsDescriptor extends UnknownRecord {
    readonly ns?: unknown;
    readonly user?: unknown;
}
export interface AgentRequestPayload extends UnknownRecord {
    readonly agent?: unknown;
}
export interface AgentRequestConfig extends UnknownRecord {
    readonly provider?: unknown;
    readonly model?: unknown;
    readonly reasoningEffort?: unknown;
}
export interface HostSettings {
    readonly writable?: unknown;
    readonly get: (namespace: string) => unknown;
    readonly update: (namespace: string, value: UnknownRecord) => unknown;
    readonly describe: () => unknown;
}
export interface HostContext {
    readonly settings?: HostSettings;
    readonly timeout: (callback: () => void, delay: number) => unknown;
    readonly on: (event: string, callback: (...args: unknown[]) => unknown, options?: UnknownRecord) => unknown;
}
export declare function isUnknownRecord(value: unknown): value is UnknownRecord;
export declare function isModelEntry(value: unknown): value is ModelEntry;
export declare function isProviderProfile(value: unknown): value is ProviderProfile;
export declare function isSettingsDescriptor(value: unknown): value is SettingsDescriptor;
export declare function isAgentRequestPayload(value: unknown): value is AgentRequestPayload;
export declare function isAgentRequestConfig(value: unknown): value is AgentRequestConfig;
