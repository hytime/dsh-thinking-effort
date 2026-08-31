import React from 'react';
import type { Translation } from '../types.js';
import type { Palette } from '../theme.js';
export interface SubagentSettingsProps {
    readonly effort: string | null;
    readonly namespaceFound: boolean;
    readonly draft: string;
    readonly custom: string;
    readonly busy: boolean;
    readonly palette: Palette;
    readonly t: Translation;
    readonly onDraftChange: (value: string) => void;
    readonly onCustomChange: (value: string) => void;
    readonly onSave: () => void;
}
export declare function SubagentSettings({ effort, namespaceFound, draft, custom, busy, palette, t, onDraftChange, onCustomChange, onSave }: SubagentSettingsProps): React.ReactElement;
