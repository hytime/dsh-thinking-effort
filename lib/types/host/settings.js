import { hostCapabilities } from '../compat/capabilities.js';
import { mark } from './marker.js';
import { isProviderProfile, isUnknownRecord, } from './types.js';
export const SETTINGS_NAMESPACE = 'llm-pi-ai';
export const DEFAULT_LEVELS = { off: null, high: 'high', max: 'max' };
const LOG_PREFIX = '[@hytime/dsh-thinking-effort]';
function log(...args) {
    console.log(LOG_PREFIX, ...args);
}
export function fillProviderDefaults(providers) {
    if (!isUnknownRecord(providers))
        return { providers, filled: 0 };
    let filled = 0;
    const nextProviders = Object.fromEntries(Object.entries(providers).map(([route, rawProfile]) => {
        if (!isProviderProfile(rawProfile))
            return [route, rawProfile];
        let nextProfile = rawProfile;
        let dirty = false;
        const models = rawProfile.models;
        if (Array.isArray(models)) {
            const nextModels = models.map((entry) => {
                if (!isUnknownRecord(entry) || entry.reasoningEfforts !== undefined)
                    return entry;
                dirty = true;
                filled += 1;
                return { ...entry, reasoningEfforts: DEFAULT_LEVELS };
            });
            if (dirty) {
                nextProfile = { ...nextProfile, models: nextModels };
            }
        }
        const overrides = rawProfile.modelOverrides;
        if (isUnknownRecord(overrides)) {
            let overridesDirty = false;
            const nextOverrides = Object.fromEntries(Object.entries(overrides).map(([id, rawEntry]) => {
                if (!isUnknownRecord(rawEntry) || rawEntry.reasoningEfforts !== undefined) {
                    return [id, rawEntry];
                }
                overridesDirty = true;
                filled += 1;
                return [id, { ...rawEntry, reasoningEfforts: DEFAULT_LEVELS }];
            }));
            if (overridesDirty) {
                nextProfile = { ...nextProfile, modelOverrides: nextOverrides };
                dirty = true;
            }
        }
        return [route, dirty ? nextProfile : rawProfile];
    }));
    return { providers: nextProviders, filled };
}
function readSection(settings) {
    try {
        return settings.get(SETTINGS_NAMESPACE);
    }
    catch (error) {
        log('read settings error:', error instanceof Error ? error.message : String(error));
        return undefined;
    }
}
async function fillDefaults(settings) {
    if (settings.writable !== true)
        return 0;
    const section = readSection(settings);
    if (!isUnknownRecord(section))
        return 0;
    const result = fillProviderDefaults(section.providers);
    if (result.filled === 0 || !isUnknownRecord(result.providers))
        return 0;
    await settings.update(SETTINGS_NAMESPACE, { providers: result.providers });
    mark(`filled-${result.filled}`);
    log('filled default thinking levels for', result.filled, 'model(s)');
    return result.filled;
}
export function installSettingsWatcher(ctx) {
    const settings = ctx.settings;
    const capabilities = hostCapabilities({ settings });
    if (capabilities.settings === 'none' || settings === undefined) {
        log('settings capability unavailable');
        return;
    }
    ctx.effect(() => {
        let alive = true;
        let retries = 0;
        const timerDisposers = [];
        const schedule = (delay) => {
            if (!alive)
                return;
            const disposer = ctx.timeout(() => {
                if (!alive)
                    return;
                void tryOnce();
            }, delay);
            if (typeof disposer === 'function')
                timerDisposers.push(() => { disposer(); });
        };
        const tryOnce = async () => {
            if (!alive)
                return;
            try {
                if ((await fillDefaults(settings)) > 0)
                    return;
            }
            catch (error) {
                if (!alive)
                    return;
                log('fill error:', error instanceof Error ? error.message : String(error));
            }
            if (!alive)
                return;
            retries += 1;
            if (retries <= 5)
                schedule(2000);
        };
        schedule(500);
        const listenerDisposer = ctx.on('settings/updated', (...args) => {
            if (!alive || args[0] !== SETTINGS_NAMESPACE)
                return;
            void fillDefaults(settings).catch((error) => {
                if (alive)
                    log('watch fill error:', error instanceof Error ? error.message : String(error));
            });
        });
        return () => {
            alive = false;
            for (const dispose of timerDisposers.splice(0))
                dispose();
            if (typeof listenerDisposer === 'function')
                listenerDisposer();
        };
    }, 'dsh-thinking-effort: settings watcher');
}
//# sourceMappingURL=settings.js.map