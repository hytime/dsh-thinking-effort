import type { ReasoningLevel } from './types.js';
export declare const ALL_LEVELS: readonly ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
export declare const DEFAULT_LEVELS: {
    readonly off: null;
    readonly high: "high";
    readonly max: "max";
};
export declare const PRESETS: readonly [{
    readonly key: "official";
    readonly levels: {
        readonly off: null;
        readonly high: "high";
        readonly max: "max";
    };
    readonly labelKey: "presetOfficial";
}, {
    readonly key: "generic";
    readonly levels: {
        readonly off: null;
        readonly low: "low";
        readonly medium: "medium";
        readonly high: "high";
    };
    readonly labelKey: "presetGeneric";
}];
export declare const NS = "llm-pi-ai";
export declare const LOCALE_NS = "settings.thinkingEffort";
export declare const CONTEXT_MIN = 2000;
export declare const CONTEXT_1M = 1000000;
export declare const CONTEXT_MAX = 1000000;
export declare const INPUT_MODALITIES: readonly ["text", "image"];
export declare const LEVEL_LABEL_KEYS: Readonly<Record<ReasoningLevel, string>>;
