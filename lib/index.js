import { writeFileSync } from "node:fs";
import { join } from "node:path";
//#region lib/types/host/marker.js
const MARKER = join(process.env.DSH_HOME || process.cwd(), "thinking-effort-loaded.json");
function mark(event) {
	try {
		writeFileSync(MARKER, JSON.stringify({
			event,
			name: "@hytime/dsh-thinking-effort",
			at: (/* @__PURE__ */ new Date()).toISOString(),
			pid: process.pid
		}, null, 2));
	} catch {}
}
//#endregion
//#region lib/types/compat/capabilities.js
function hasMethods(value, methods) {
	if (typeof value !== "object" && typeof value !== "function" || value === null) return false;
	return methods.every((method) => {
		let current = value;
		while (current !== null) {
			const descriptor = Object.getOwnPropertyDescriptor(current, method);
			if (descriptor !== void 0) return typeof descriptor.value === "function";
			current = Object.getPrototypeOf(current);
		}
		return false;
	});
}
function capabilities(settings, externalLanguages) {
	return {
		settings,
		externalLanguages
	};
}
function hostCapabilities(input) {
	return capabilities(hasMethods(input.settings, [
		"get",
		"update",
		"describe"
	]) ? "legacy" : "none", false);
}
//#endregion
//#region lib/types/host/types.js
function isUnknownRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isProviderProfile(value) {
	return isUnknownRecord(value);
}
function isAgentRequestConfig(value) {
	return isUnknownRecord(value);
}
//#endregion
//#region lib/types/host/settings.js
const SETTINGS_NAMESPACE = "llm-pi-ai";
const DEFAULT_LEVELS = {
	off: null,
	high: "high",
	max: "max"
};
const LOG_PREFIX$1 = "[@hytime/dsh-thinking-effort]";
function log$1(...args) {
	console.log(LOG_PREFIX$1, ...args);
}
function fillProviderDefaults(providers) {
	if (!isUnknownRecord(providers)) return {
		providers,
		filled: 0
	};
	let filled = 0;
	return {
		providers: Object.fromEntries(Object.entries(providers).map(([route, rawProfile]) => {
			if (!isProviderProfile(rawProfile)) return [route, rawProfile];
			let nextProfile = rawProfile;
			let dirty = false;
			const models = rawProfile.models;
			if (Array.isArray(models)) {
				const nextModels = models.map((entry) => {
					if (!isUnknownRecord(entry) || entry.reasoningEfforts !== void 0) return entry;
					dirty = true;
					filled += 1;
					return {
						...entry,
						reasoningEfforts: DEFAULT_LEVELS
					};
				});
				if (dirty) nextProfile = {
					...nextProfile,
					models: nextModels
				};
			}
			const overrides = rawProfile.modelOverrides;
			if (isUnknownRecord(overrides)) {
				let overridesDirty = false;
				const nextOverrides = Object.fromEntries(Object.entries(overrides).map(([id, rawEntry]) => {
					if (!isUnknownRecord(rawEntry) || rawEntry.reasoningEfforts !== void 0) return [id, rawEntry];
					overridesDirty = true;
					filled += 1;
					return [id, {
						...rawEntry,
						reasoningEfforts: DEFAULT_LEVELS
					}];
				}));
				if (overridesDirty) {
					nextProfile = {
						...nextProfile,
						modelOverrides: nextOverrides
					};
					dirty = true;
				}
			}
			return [route, dirty ? nextProfile : rawProfile];
		})),
		filled
	};
}
function readSection(settings) {
	try {
		return settings.get(SETTINGS_NAMESPACE);
	} catch (error) {
		log$1("read settings error:", error instanceof Error ? error.message : String(error));
		return;
	}
}
async function fillDefaults(settings) {
	if (settings.writable !== true) return 0;
	const section = readSection(settings);
	if (!isUnknownRecord(section)) return 0;
	const result = fillProviderDefaults(section.providers);
	if (result.filled === 0 || !isUnknownRecord(result.providers)) return 0;
	await settings.update(SETTINGS_NAMESPACE, { providers: result.providers });
	mark(`filled-${result.filled}`);
	log$1("filled default thinking levels for", result.filled, "model(s)");
	return result.filled;
}
function installSettingsWatcher(ctx) {
	const settings = ctx.settings;
	if (hostCapabilities({ settings }).settings === "none" || settings === void 0) {
		log$1("settings capability unavailable");
		return;
	}
	let retries = 0;
	const tryOnce = async () => {
		try {
			if (await fillDefaults(settings) > 0) return;
		} catch (error) {
			log$1("fill error:", error instanceof Error ? error.message : String(error));
		}
		retries += 1;
		if (retries <= 5) ctx.timeout(() => {
			tryOnce();
		}, 2e3);
	};
	ctx.timeout(() => {
		tryOnce();
	}, 500);
	ctx.on("settings/updated", (...args) => {
		if (args[0] !== "llm-pi-ai") return;
		fillDefaults(settings).catch((error) => {
			log$1("watch fill error:", error instanceof Error ? error.message : String(error));
		});
	});
}
//#endregion
//#region lib/types/host/subagent.js
const STANDARD_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max"
];
const LOG_PREFIX = "[@hytime/dsh-thinking-effort]";
function log(...args) {
	console.log(LOG_PREFIX, ...args);
}
function readDescriptorUser(settings) {
	const descriptors = settings.describe();
	if (!Array.isArray(descriptors)) return void 0;
	const descriptor = descriptors.find((entry) => isUnknownRecord(entry) && entry.ns === "llm-pi-ai");
	return isUnknownRecord(descriptor) ? descriptor.user : void 0;
}
function readSubagentEffort(settings, logger = log) {
	if (settings === void 0) return void 0;
	try {
		const user = readDescriptorUser(settings);
		if (!isUnknownRecord(user)) return void 0;
		return typeof user.subagentEffort === "string" && user.subagentEffort.length > 0 ? user.subagentEffort : void 0;
	} catch (error) {
		logger("read subagent effort error:", error instanceof Error ? error.message : String(error));
		return;
	}
}
function findModel(settings, config) {
	const section = settings.get(SETTINGS_NAMESPACE);
	if (!isUnknownRecord(section) || !isUnknownRecord(section.providers)) return void 0;
	if (typeof config.provider !== "string" || typeof config.model !== "string") return void 0;
	if (!Object.prototype.hasOwnProperty.call(section.providers, config.provider)) return void 0;
	const profile = section.providers[config.provider];
	if (!isUnknownRecord(profile)) return void 0;
	if (Array.isArray(profile.models)) {
		const model = profile.models.find((entry) => isUnknownRecord(entry) && entry.id === config.model);
		if (model !== void 0) return model;
	}
	if (isUnknownRecord(profile.modelOverrides) && Object.prototype.hasOwnProperty.call(profile.modelOverrides, config.model)) return profile.modelOverrides[config.model];
}
function resolveSubagentEffort(settings, config, logger = log) {
	const subagentEffort = readSubagentEffort(settings, logger);
	if (subagentEffort === void 0) return void 0;
	if (STANDARD_LEVELS.includes(subagentEffort)) return subagentEffort;
	if (settings === void 0 || !isAgentRequestConfig(config)) return void 0;
	try {
		const model = findModel(settings, config);
		if (!isUnknownRecord(model) || !isUnknownRecord(model.reasoningEfforts)) return void 0;
		for (const [level, wire] of Object.entries(model.reasoningEfforts)) if (typeof wire === "string" && wire === subagentEffort) return level;
		logger("subagent custom effort is not mapped for", `${String(config.provider)}/${String(config.model)}`);
	} catch (error) {
		logger("resolve subagent effort error:", error instanceof Error ? error.message : String(error));
	}
}
function isSubagentPayload(payload) {
	if (!isUnknownRecord(payload) || !isUnknownRecord(payload.agent)) return false;
	const session = payload.agent.session;
	if (!isUnknownRecord(session) || !isUnknownRecord(session.header)) return false;
	return session.header.origin === "subagent";
}
async function handleAgentRequest(ctx, payload, next) {
	const config = await next();
	try {
		if (!isSubagentPayload(payload) || !isAgentRequestConfig(config)) return config;
		if (config.reasoningEffort !== void 0) return config;
		const effort = resolveSubagentEffort(ctx.settings, config);
		return effort === void 0 ? config : {
			...config,
			reasoningEffort: effort
		};
	} catch (error) {
		log("agent/request override error:", error instanceof Error ? error.message : String(error));
		return config;
	}
}
//#endregion
//#region lib/types/index.js
const name = "@hytime/dsh-thinking-effort";
const inject = ["settings", "timer"];
function apply(ctx) {
	mark("apply");
	installSettingsWatcher(ctx);
	ctx.on("agent/request", (...args) => {
		const payload = args[0];
		const next = args[1];
		return handleAgentRequest(ctx, payload, next);
	}, { global: true });
}
//#endregion
export { apply, inject, name };
