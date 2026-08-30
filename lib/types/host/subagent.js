import { isAgentRequestConfig, isUnknownRecord, } from './types.js';
import { SETTINGS_NAMESPACE } from './settings.js';
export const STANDARD_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const LOG_PREFIX = '[@hytime/dsh-thinking-effort]';
function log(...args) {
    console.log(LOG_PREFIX, ...args);
}
function readDescriptorUser(settings) {
    const descriptors = settings.describe();
    if (!Array.isArray(descriptors))
        return undefined;
    const descriptor = descriptors.find((entry) => (isUnknownRecord(entry) && entry.ns === SETTINGS_NAMESPACE));
    return isUnknownRecord(descriptor) ? descriptor.user : undefined;
}
export function readSubagentEffort(settings, logger = log) {
    if (settings === undefined)
        return undefined;
    try {
        const user = readDescriptorUser(settings);
        if (!isUnknownRecord(user))
            return undefined;
        return typeof user.subagentEffort === 'string' && user.subagentEffort.length > 0
            ? user.subagentEffort
            : undefined;
    }
    catch (error) {
        logger('read subagent effort error:', error instanceof Error ? error.message : String(error));
        return undefined;
    }
}
function findModel(settings, config) {
    const section = settings.get(SETTINGS_NAMESPACE);
    if (!isUnknownRecord(section) || !isUnknownRecord(section.providers))
        return undefined;
    if (typeof config.provider !== 'string' || typeof config.model !== 'string')
        return undefined;
    if (!Object.prototype.hasOwnProperty.call(section.providers, config.provider))
        return undefined;
    const profile = section.providers[config.provider];
    if (!isUnknownRecord(profile))
        return undefined;
    if (Array.isArray(profile.models)) {
        const model = profile.models.find((entry) => (isUnknownRecord(entry) && entry.id === config.model));
        if (model !== undefined)
            return model;
    }
    if (isUnknownRecord(profile.modelOverrides)
        && Object.prototype.hasOwnProperty.call(profile.modelOverrides, config.model)) {
        return profile.modelOverrides[config.model];
    }
    return undefined;
}
export function resolveSubagentEffort(settings, config, logger = log) {
    const subagentEffort = readSubagentEffort(settings, logger);
    if (subagentEffort === undefined)
        return undefined;
    if (STANDARD_LEVELS.includes(subagentEffort))
        return subagentEffort;
    if (settings === undefined || !isAgentRequestConfig(config))
        return undefined;
    try {
        const model = findModel(settings, config);
        if (!isUnknownRecord(model) || !isUnknownRecord(model.reasoningEfforts))
            return undefined;
        for (const [level, wire] of Object.entries(model.reasoningEfforts)) {
            if (typeof wire === 'string' && wire === subagentEffort)
                return level;
        }
        logger('subagent custom effort is not mapped for', `${String(config.provider)}/${String(config.model)}`);
    }
    catch (error) {
        logger('resolve subagent effort error:', error instanceof Error ? error.message : String(error));
    }
    return undefined;
}
function isSubagentPayload(payload) {
    if (!isUnknownRecord(payload) || !isUnknownRecord(payload.agent))
        return false;
    const session = payload.agent.session;
    if (!isUnknownRecord(session) || !isUnknownRecord(session.header))
        return false;
    return session.header.origin === 'subagent';
}
export async function handleAgentRequest(ctx, payload, next) {
    const config = await next();
    try {
        if (!isSubagentPayload(payload) || !isAgentRequestConfig(config))
            return config;
        if (config.reasoningEffort !== undefined)
            return config;
        const effort = resolveSubagentEffort(ctx.settings, config);
        return effort === undefined ? config : { ...config, reasoningEffort: effort };
    }
    catch (error) {
        log('agent/request override error:', error instanceof Error ? error.message : String(error));
        return config;
    }
}
//# sourceMappingURL=subagent.js.map