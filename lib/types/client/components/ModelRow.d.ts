import React from 'react';
import { ALL_LEVELS } from '../constants.js';
import type { ContextDraft, DraftCell, InputDraft, InventoryItem, ReasoningDraft, Translation } from '../types.js';
import type { Palette } from '../theme.js';
export interface ModelRowProps {
    readonly item: InventoryItem;
    readonly open: boolean;
    readonly draft?: ReasoningDraft;
    readonly contextDraft: ContextDraft;
    readonly inputDraft: InputDraft;
    readonly dirty: boolean;
    readonly busy: boolean;
    readonly palette: Palette;
    readonly t: Translation;
    readonly onToggle: () => void;
    readonly onLevelChange: (level: typeof ALL_LEVELS[number], patch: Partial<DraftCell>) => void;
    readonly onContextChange: (value: string) => void;
    readonly onOneMillionChange: (enabled: boolean) => void;
    readonly onInputChange: (modality: 'text' | 'image', enabled: boolean) => void;
    readonly onSave: () => void;
    readonly onRestoreReasoning: () => void;
    readonly onRestoreCapability: () => void;
}
export declare function ModelRow({ item, open, draft, contextDraft, inputDraft, dirty, busy, palette, t, onToggle, onLevelChange, onContextChange, onOneMillionChange, onInputChange, onSave, onRestoreReasoning, onRestoreCapability }: ModelRowProps): React.ReactElement;
