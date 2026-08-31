function record(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : undefined;
}
function modelItem(route, model, raw, index, inOverrides) {
    const levels = raw.reasoningEfforts === undefined ? null : raw.reasoningEfforts;
    const contextWindow = Number.isInteger(raw.contextWindow) ? raw.contextWindow : undefined;
    const input = Array.isArray(raw.input) ? raw.input : [];
    return {
        route,
        model,
        name: typeof raw.name === 'string' && raw.name.length > 0 ? raw.name : model,
        levels,
        contextWindow,
        input,
        raw,
        index,
        inOverrides,
    };
}
export function inventoryFrom(namespace) {
    const descriptor = record(namespace);
    const value = record(descriptor?.value);
    const providers = record(value?.providers);
    if (!providers)
        return [];
    const inventory = [];
    for (const [route, profileValue] of Object.entries(providers)) {
        const profile = record(profileValue);
        if (!profile)
            continue;
        if (Array.isArray(profile.models)) {
            profile.models.forEach((entry, index) => {
                const raw = record(entry);
                const model = typeof raw?.id === 'string' ? raw.id : undefined;
                if (raw && model !== undefined)
                    inventory.push(modelItem(route, model, raw, index, false));
            });
        }
        const overrides = record(profile.modelOverrides);
        if (overrides) {
            for (const [model, entry] of Object.entries(overrides)) {
                inventory.push(modelItem(route, model, record(entry) ?? {}, -1, true));
            }
        }
    }
    return inventory;
}
//# sourceMappingURL=model-inventory.js.map