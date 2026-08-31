export interface Palette {
    readonly canvas: string;
    readonly group: string;
    readonly raised: string;
    readonly field: string;
    readonly border: string;
    readonly divider: string;
    readonly text: string;
    readonly secondary: string;
    readonly accent: string;
    readonly accentSoft: string;
    readonly accentBorder: string;
    readonly switchOff: string;
    readonly danger: string;
    readonly dangerBg: string;
    readonly dangerBorder: string;
    readonly shadow: string;
}
export interface PaletteEnvironment {
    readonly backgroundColor?: string;
    readonly prefersDark?: boolean;
}
export declare function iosPalette(environment?: PaletteEnvironment): Palette;
