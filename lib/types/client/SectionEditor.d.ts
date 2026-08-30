import React from 'react';
import type { ClientLocale, SettingsApi, Translation } from './types.js';
import type { Palette } from './theme.js';
export interface SectionEditorProps {
    readonly settings: SettingsApi;
    readonly locale: ClientLocale;
    readonly t: Translation;
    readonly palette?: Palette;
}
export declare function SectionEditor({ settings, locale, t, palette }: SectionEditorProps): React.ReactElement;
