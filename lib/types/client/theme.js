function isDark(environment) {
    if (environment?.backgroundColor !== undefined) {
        const values = environment.backgroundColor.match(/\d+(?:\.\d+)?/g);
        const alpha = values && values.length > 3 ? Number(values[3]) : 1;
        if (values && values.length >= 3 && alpha > 0) {
            const rgb = values.slice(0, 3).map(Number);
            return (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722) < 145;
        }
    }
    if (environment?.prefersDark !== undefined)
        return environment.prefersDark;
    return true;
}
export function iosPalette(environment) {
    let dark = true;
    if (environment === undefined) {
        try {
            const body = typeof document === 'undefined' ? undefined : document.body;
            const backgroundColor = body === undefined ? undefined : getComputedStyle(body).backgroundColor;
            const prefersDark = typeof window === 'undefined' || typeof window.matchMedia !== 'function'
                ? undefined
                : window.matchMedia('(prefers-color-scheme: dark)').matches;
            dark = isDark({ backgroundColor, prefersDark });
        }
        catch {
            dark = true;
        }
    }
    else {
        dark = isDark(environment);
    }
    return dark
        ? {
            canvas: '#1C1C1E', group: '#2C2C2E', raised: '#3A3A3C', field: '#2C2C2E',
            border: 'rgba(255,255,255,0.12)', divider: 'rgba(255,255,255,0.10)',
            text: '#F5F5F7', secondary: 'rgba(235,235,245,0.60)', accent: '#0A84FF', accentSoft: 'rgba(10,132,255,0.16)', accentBorder: 'rgba(10,132,255,0.42)',
            switchOff: '#39393D', danger: '#FF453A', dangerBg: 'rgba(255,69,58,0.16)', dangerBorder: 'rgba(255,69,58,0.30)', shadow: '0 1px 1px rgba(0,0,0,0.24)',
        }
        : {
            canvas: '#F2F2F7', group: '#FFFFFF', raised: '#F9F9FB', field: '#F2F2F7',
            border: 'rgba(60,60,67,0.18)', divider: 'rgba(60,60,67,0.18)',
            text: '#1C1C1E', secondary: '#6D6D72', accent: '#007AFF', accentSoft: 'rgba(0,122,255,0.10)', accentBorder: 'rgba(0,122,255,0.32)',
            switchOff: '#E5E5EA', danger: '#FF3B30', dangerBg: 'rgba(255,59,48,0.12)', dangerBorder: 'rgba(255,59,48,0.28)', shadow: '0 1px 1px rgba(0,0,0,0.05)',
        };
}
//# sourceMappingURL=theme.js.map