export const ALL_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
export const DEFAULT_LEVELS = { off: null, high: 'high', max: 'max' };
export const PRESETS = [
    { key: 'official', levels: DEFAULT_LEVELS, labelKey: 'presetOfficial' },
    { key: 'generic', levels: { off: null, low: 'low', medium: 'medium', high: 'high' }, labelKey: 'presetGeneric' },
];
export const NS = 'llm-pi-ai';
export const LOCALE_NS = 'settings.thinkingEffort';
export const CONTEXT_MIN = 2000;
export const CONTEXT_1M = 1000000;
export const CONTEXT_MAX = CONTEXT_1M;
export const INPUT_MODALITIES = ['text', 'image'];
export const LEVEL_LABEL_KEYS = {
    off: 'levelOff',
    minimal: 'levelMinimal',
    low: 'levelLow',
    medium: 'levelMedium',
    high: 'levelHigh',
    xhigh: 'levelXhigh',
    max: 'levelMax',
};
//# sourceMappingURL=constants.js.map