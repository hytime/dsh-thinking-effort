import React, { type ReactNode } from 'react';
import type { Palette } from '../theme.js';
export type IconName = 'check' | 'chevronDown' | 'chevronUp' | 'context' | 'image' | 'layers' | 'model' | 'restore' | 'search' | 'settings' | 'sliders' | 'sparkles' | 'text';
export type ButtonTone = 'primary' | 'secondary' | 'danger' | 'ghost';
interface IconProps {
    readonly name: IconName;
    readonly size?: number;
}
export declare function Icon({ name, size }: IconProps): React.ReactElement;
export interface ActionButtonProps {
    readonly text?: string;
    readonly onClick: () => void;
    readonly disabled?: boolean;
    readonly tone?: ButtonTone;
    readonly palette: Palette;
    readonly icon?: IconName;
    readonly label?: string;
    readonly children?: ReactNode;
}
export declare function ActionButton({ text, onClick, disabled, tone, palette, icon, label, children }: ActionButtonProps): React.ReactElement;
export interface SwitchControlProps {
    readonly checked: boolean;
    readonly onChange: (checked: boolean) => void;
    readonly disabled?: boolean;
    readonly label: string;
    readonly palette: Palette;
}
export declare function SwitchControl({ checked, onChange, disabled, label, palette }: SwitchControlProps): React.ReactElement;
export {};
