import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function Icon({ name, size = 15 }) {
    const children = [];
    if (name === 'sliders' || name === 'settings') {
        children.push(_jsx("path", { d: "M4 6h16M4 12h16M4 18h16" }, "lines"), _jsx("circle", { cx: "8", cy: "6", r: "2" }, "a"), _jsx("circle", { cx: "15", cy: "12", r: "2" }, "b"), _jsx("circle", { cx: "10", cy: "18", r: "2" }, "c"));
    }
    else if (name === 'chevronDown') {
        children.push(_jsx("path", { d: "m6 9 6 6 6-6" }, "path"));
    }
    else if (name === 'chevronUp') {
        children.push(_jsx("path", { d: "m18 15-6-6-6 6" }, "path"));
    }
    else if (name === 'check') {
        children.push(_jsx("path", { d: "m5 12 4 4L19 6" }, "path"));
    }
    else if (name === 'restore') {
        children.push(_jsx("path", { d: "M9 7H5v4" }, "arrow"), _jsx("path", { d: "M5 11a7 7 0 1 1 2 6" }, "curve"));
    }
    else if (name === 'search') {
        children.push(_jsx("circle", { cx: "11", cy: "11", r: "6.5" }, "circle"), _jsx("path", { d: "m16 16 4 4" }, "handle"));
    }
    else if (name === 'layers') {
        children.push(_jsx("path", { d: "m12 3 8 4-8 4-8-4 8-4Z" }, "top"), _jsx("path", { d: "m4 12 8 4 8-4" }, "middle"), _jsx("path", { d: "m4 17 8 4 8-4" }, "bottom"));
    }
    else if (name === 'text') {
        children.push(_jsx("path", { d: "M5 5h14M12 5v14M8 19h8" }, "path"));
    }
    else if (name === 'image') {
        children.push(_jsx("rect", { x: "3", y: "4", width: "18", height: "16", rx: "2" }, "rect"), _jsx("circle", { cx: "8.5", cy: "9", r: "1.5" }, "circle"), _jsx("path", { d: "m4 17 5-5 3 3 2-2 6 4" }, "mountain"));
    }
    else if (name === 'model') {
        children.push(_jsx("path", { d: "m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" }, "box"), _jsx("path", { d: "m4 7.5 8 4.5 8-4.5" }, "top"), _jsx("path", { d: "M12 12v9" }, "side"));
    }
    else if (name === 'context') {
        children.push(_jsx("path", { d: "M8 4H5v16h3M16 4h3v16h-3" }, "brackets"), _jsx("path", { d: "M10 8h4M10 12h4M10 16h4" }, "lines"));
    }
    else if (name === 'sparkles') {
        children.push(_jsx("path", { d: "m12 3-1.2 4.8L6 9l4.8 1.2L12 15l1.2-4.8L18 9l-4.8-1.2L12 3Z" }, "large"), _jsx("path", { d: "m19 14-.7 2.3L16 17l2.3.7L19 20l.7-2.3L22 17l-2.3-.7L19 14Z" }, "small"));
    }
    return _jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", focusable: "false", style: { display: 'block', flex: '0 0 auto' }, children: children });
}
export function ActionButton({ text = '', onClick, disabled = false, tone = 'secondary', palette, icon, label, children }) {
    const visual = tone === 'primary'
        ? { background: palette.accent, color: '#FFFFFF', border: palette.accent }
        : tone === 'danger'
            ? { background: palette.dangerBg, color: palette.danger, border: palette.dangerBorder }
            : tone === 'ghost'
                ? { background: 'transparent', color: palette.accent, border: 'transparent' }
                : { background: palette.field, color: palette.text, border: palette.border };
    const iconOnly = text.length === 0 && children === undefined;
    return _jsxs("button", { type: "button", title: label, "aria-label": label, disabled: disabled, onClick: onClick, style: { height: '28px', minWidth: '28px', width: iconOnly ? '28px' : undefined, padding: iconOnly ? 0 : '0 9px', borderRadius: '8px', border: `1px solid ${visual.border}`, backgroundColor: visual.background, color: visual.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px', fontSize: '12px', fontWeight: 600, letterSpacing: 0, whiteSpace: 'nowrap', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, boxShadow: tone === 'primary' ? palette.shadow : 'none', transition: 'background-color 150ms ease, opacity 150ms ease, transform 150ms ease' }, children: [icon ? _jsx(Icon, { name: icon, size: 14 }) : null, text ? _jsx("span", { children: text }) : children] });
}
export function SwitchControl({ checked, onChange, disabled = false, label, palette }) {
    return _jsx("button", { type: "button", role: "switch", "aria-checked": checked, "aria-label": label, title: label, disabled: disabled, onClick: () => onChange(!checked), style: { width: '44px', height: '26px', minWidth: '44px', padding: 0, position: 'relative', border: `1px solid ${checked ? palette.accent : palette.border}`, borderRadius: '13px', backgroundColor: checked ? palette.accent : palette.switchOff, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, transition: 'background-color 160ms ease, border-color 160ms ease' }, children: _jsx("span", { style: { position: 'absolute', top: '2px', left: '2px', width: '20px', height: '20px', borderRadius: '10px', backgroundColor: '#FFFFFF', boxShadow: '0 1px 2px rgba(0,0,0,0.25)', transform: checked ? 'translateX(18px)' : 'translateX(0)', transition: 'transform 160ms ease' } }) });
}
//# sourceMappingURL=Controls.js.map