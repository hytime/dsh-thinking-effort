import { ALL_LEVELS, CONTEXT_1M, CONTEXT_MAX, CONTEXT_MIN } from './constants.js';
import type { ContextDraft, InputDraft, InventoryItem, ReasoningDraft, ReasoningEfforts, Translation } from './types.js';
export declare function draftFrom(levels: ReasoningEfforts | null | undefined): ReasoningDraft;
export declare function buildLevels(draft: ReasoningDraft): ReasoningEfforts;
export declare function contextDraftFrom(item: Pick<InventoryItem, 'contextWindow'>): ContextDraft;
export declare function inputDraftFrom(item: Pick<InventoryItem, 'input'>): InputDraft;
export declare function buildInput(draft: Pick<InputDraft, 'text' | 'image'> | undefined, translate: Translation): {
    value?: readonly ('text' | 'image')[];
    error?: string;
};
export declare function validateContextWindow(draft: Pick<ContextDraft, 'value' | 'oneMillion'> | undefined, translate: Translation): {
    value?: number;
    error?: string;
};
export declare function validateLevels(levels: ReasoningEfforts, translate: Translation): string | null;
export { ALL_LEVELS, CONTEXT_1M, CONTEXT_MAX, CONTEXT_MIN };
