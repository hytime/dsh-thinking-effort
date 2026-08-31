import type { DshCompatibilityCapabilities } from '../client/types.js';
export type { CompatibilitySettings, DshCompatibilityCapabilities } from '../client/types.js';
export declare function clientCapabilities(input: {
    readonly remoteSettings?: unknown;
    readonly legacySettings?: unknown;
    readonly addLanguage?: unknown;
}): DshCompatibilityCapabilities;
export declare function hostCapabilities(input: {
    readonly settings?: unknown;
}): DshCompatibilityCapabilities;
