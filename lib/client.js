window.__ModuleLoader__.load({ id: '@hytime/dsh-thinking-effort', factory: (require) => { var module = { exports: {} }; var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
//#region \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
//#endregion
let react = require("react");
react = __toESM(react, 1);
let react_jsx_runtime = require("react/jsx-runtime");
//#endregion
//#region lib/types/client/locales.js
const LOCALE_DATA = {
	zh: {
		title: "第三方模型思考强度档位",
		description: "勾选档位后，右侧输入框可自由定义发送给网关的线上值。例如给 high 填 ultra，Composer 选中 High 时网关会收到 ultra。未设置档位的模型自动采用默认档位（Off / High / Max）。",
		subagentTitle: "子 agent 思考强度（Subagent 默认档位）",
		currentDefault: "当前默认：{effort}",
		unconfiguredSubagent: "未配置（子 agent 继承主 agent / 提供方默认）",
		providerDefault: "提供方默认",
		apply: "应用",
		presetOfficial: "应用到全部：Off / High / Max（官方 DeepSeek 风格）",
		presetGeneric: "应用到全部：Off / Low / Medium / High（通用）",
		searchPlaceholder: "搜索模型（名称或 ID）…",
		loading: "加载中…",
		noModels: "没有手工声明的 pi-ai 模型",
		noMatches: "没有匹配的模型",
		noDeclared: "未声明",
		route: "路由：{route}",
		customize: "自定义档位",
		collapse: "收起",
		editorTitle: "编辑档位（勾选后填写线上值，点击“应用此档位”保存）",
		applyLevel: "应用此档位",
		restoreDefault: "恢复默认档位",
		expandedCount: "已展开 {count} 个模型，可编辑档位",
		versionLabel: "插件版本",
		languageLabel: "页面语言",
		languageChinese: "中文",
		languageEnglish: "English",
		languageJapanese: "日本語",
		languageKorean: "한국어",
		customPlaceholder: "自定义档位，如 ultra",
		offPlaceholder: "留空 = 不发送",
		wirePlaceholder: "自定义线上值，如 ultra",
		noNamespace: "未找到 llm-pi-ai 设置命名空间（无第三方模型配置）。",
		customEffortRequired: "请输入自定义思考档位",
		levelNeedsValue: "档位 {level} 需要填写线上值",
		atLeastThinking: "至少需要一个思考档位",
		readSettingsFailed: "读取设置失败：{message}",
		writeFailed: "写入失败，请重试",
		writeError: "写入失败：{message}",
		levelOff: "off",
		levelMinimal: "minimal",
		levelLow: "low",
		levelMedium: "medium",
		levelHigh: "high",
		levelXhigh: "xhigh",
		levelMax: "max",
		levelSuffix: " 档位",
		pageTitle: "模型能力与档位",
		subagentCardTitle: "子 agent 默认档位",
		inputCapabilityMinimum: "至少启用一种输入能力",
		contextInteger: "上下文长度必须是整数（2000-1000000）",
		contextRange: "上下文长度必须在 2000 到 1000000 之间",
		saveMissingNamespace: "保存成功但未返回最新设置",
		settingsUpdated: "设置已更新",
		modelSettingsSaved: "模型设置已保存",
		restoreReasoning: "已恢复默认思考档位",
		restoreCapability: "已恢复默认能力",
		officialPreset: "官方预设",
		genericPreset: "通用预设",
		subagentSaved: "子 agent 默认档位已保存",
		quickSettings: "一键设置",
		vendor: "供应商",
		modelCount: "{count} 个模型",
		searchResults: "搜索结果",
		model: "模型",
		unsaved: "未保存",
		textEnabled: "文字输入：已启用",
		textDisabled: "文字输入：未启用",
		imageEnabled: "图像输入：已启用",
		imageDisabled: "图像输入：未启用",
		openModelSettings: "打开模型设置",
		closeModelSettings: "收起模型设置",
		contextLength: "上下文长度",
		oneMillionMode: "1M 模式",
		inputCapabilities: "输入能力",
		textInput: "文字输入",
		imageInput: "图像输入",
		reasoningLevels: "思考档位",
		saveChanges: "保存更改",
		saved: "已保存",
		saveModelChanges: "保存模型更改",
		noPendingChanges: "没有待保存的更改",
		expandedSettings: "已展开 {count} 个模型，可编辑设置",
		collapseProvider: "收起供应商",
		expandProvider: "展开供应商",
		providerDefaultShort: "提供方默认",
		contextTitle: "上下文 {value}",
		contextLabel: "上下文 {label}"
	},
	en: {
		title: "Third-party model reasoning effort",
		description: "Select an effort and enter the exact value sent to the gateway. For example, set high to ultra to send ultra when High is selected in Composer. Models without a declaration use the default options (Off / High / Max).",
		subagentTitle: "Subagent reasoning effort",
		currentDefault: "Current default: {effort}",
		unconfiguredSubagent: "Not configured (subagents inherit the provider default)",
		providerDefault: "Provider default",
		apply: "Apply",
		presetOfficial: "Apply to all: Off / High / Max (official DeepSeek style)",
		presetGeneric: "Apply to all: Off / Low / Medium / High (generic)",
		searchPlaceholder: "Search models by name or ID…",
		loading: "Loading…",
		noModels: "No hand-declared pi-ai models",
		noMatches: "No matching models",
		noDeclared: "Not declared",
		route: "Route: {route}",
		customize: "Customize effort",
		collapse: "Collapse",
		editorTitle: "Edit effort (select a level, enter its wire value, then apply)",
		applyLevel: "Apply effort",
		restoreDefault: "Restore defaults",
		expandedCount: "{count} models expanded",
		versionLabel: "Plugin version",
		languageLabel: "Page language",
		languageChinese: "中文",
		languageEnglish: "English",
		languageJapanese: "日本語",
		languageKorean: "한국어",
		customPlaceholder: "Custom effort, e.g. ultra",
		offPlaceholder: "Empty = do not send",
		wirePlaceholder: "Custom wire value, e.g. ultra",
		noNamespace: "llm-pi-ai settings were not found (no third-party model configuration).",
		customEffortRequired: "Enter a custom reasoning effort",
		levelNeedsValue: "Effort {level} needs a wire value",
		atLeastThinking: "Select at least one reasoning effort",
		readSettingsFailed: "Failed to read settings: {message}",
		writeFailed: "Write failed. Please try again.",
		writeError: "Write failed: {message}",
		levelOff: "off",
		levelMinimal: "minimal",
		levelLow: "low",
		levelMedium: "medium",
		levelHigh: "high",
		levelXhigh: "xhigh",
		levelMax: "max",
		levelSuffix: " effort",
		pageTitle: "Model capabilities and effort",
		subagentCardTitle: "Subagent default effort",
		inputCapabilityMinimum: "Enable at least one input capability",
		contextInteger: "Context length must be an integer (2000-1000000)",
		contextRange: "Context length must be between 2000 and 1000000",
		saveMissingNamespace: "Saved, but the latest settings were not returned",
		settingsUpdated: "Settings updated",
		modelSettingsSaved: "Model settings saved",
		restoreReasoning: "Default reasoning effort restored",
		restoreCapability: "Default capabilities restored",
		officialPreset: "official preset",
		genericPreset: "generic preset",
		subagentSaved: "Subagent default effort saved",
		quickSettings: "Quick settings",
		vendor: "Provider",
		modelCount: "{count} models",
		searchResults: "Search results",
		model: "Model",
		unsaved: "Unsaved",
		textEnabled: "Text input: enabled",
		textDisabled: "Text input: disabled",
		imageEnabled: "Image input: enabled",
		imageDisabled: "Image input: disabled",
		openModelSettings: "Open model settings",
		closeModelSettings: "Collapse model settings",
		contextLength: "Context length",
		oneMillionMode: "1M mode",
		inputCapabilities: "Input capabilities",
		textInput: "Text input",
		imageInput: "Image input",
		reasoningLevels: "Reasoning effort",
		saveChanges: "Save changes",
		saved: "Saved",
		saveModelChanges: "Save model changes",
		noPendingChanges: "No pending changes",
		expandedSettings: "{count} models expanded",
		collapseProvider: "Collapse provider",
		expandProvider: "Expand provider",
		providerDefaultShort: "Provider default",
		contextTitle: "Context {value}",
		contextLabel: "Context {label}"
	},
	ja: {
		title: "サードパーティモデルの推論強度",
		description: "推論強度を選択し、ゲートウェイに送信する値を入力します。たとえば high に ultra を設定すると、Composer で High を選択したときに ultra が送信されます。未設定のモデルには既定の選択肢（Off / High / Max）が使用されます。",
		subagentTitle: "Subagent の推論強度",
		currentDefault: "現在の既定値：{effort}",
		unconfiguredSubagent: "未設定（Subagent はプロバイダーの既定値を継承）",
		providerDefault: "プロバイダーの既定値",
		apply: "適用",
		presetOfficial: "すべてに適用：Off / High / Max（公式 DeepSeek 形式）",
		presetGeneric: "すべてに適用：Off / Low / Medium / High（汎用）",
		searchPlaceholder: "モデル名または ID で検索…",
		loading: "読み込み中…",
		noModels: "手動で宣言された pi-ai モデルはありません",
		noMatches: "一致するモデルはありません",
		noDeclared: "未宣言",
		route: "ルート：{route}",
		customize: "推論強度をカスタマイズ",
		collapse: "折りたたむ",
		editorTitle: "推論強度を編集（レベルを選択し、送信値を入力して適用）",
		applyLevel: "推論強度を適用",
		restoreDefault: "既定値に戻す",
		expandedCount: "{count} 個のモデルを展開中",
		versionLabel: "プラグインバージョン",
		languageLabel: "ページの言語",
		languageChinese: "中文",
		languageEnglish: "English",
		languageJapanese: "日本語",
		languageKorean: "한국어",
		customPlaceholder: "カスタム推論強度（例：ultra）",
		offPlaceholder: "空欄 = 送信しない",
		wirePlaceholder: "カスタム送信値（例：ultra）",
		noNamespace: "llm-pi-ai の設定名前空間が見つかりません（サードパーティモデルの設定がありません）。",
		customEffortRequired: "カスタム推論強度を入力してください",
		levelNeedsValue: "推論強度 {level} には送信値が必要です",
		atLeastThinking: "少なくとも 1 つの推論強度を選択してください",
		readSettingsFailed: "設定の読み込みに失敗しました：{message}",
		writeFailed: "書き込みに失敗しました。もう一度お試しください。",
		writeError: "書き込みに失敗しました：{message}",
		levelOff: "off",
		levelMinimal: "minimal",
		levelLow: "low",
		levelMedium: "medium",
		levelHigh: "high",
		levelXhigh: "xhigh",
		levelMax: "max",
		levelSuffix: " の推論強度",
		pageTitle: "モデルの能力と推論強度",
		subagentCardTitle: "Subagent の既定の推論強度",
		inputCapabilityMinimum: "少なくとも 1 つの入力能力を有効にしてください",
		contextInteger: "コンテキスト長は整数で入力してください（2000-1000000）",
		contextRange: "コンテキスト長は 2000 から 1000000 の範囲で指定してください",
		saveMissingNamespace: "保存しましたが、最新の設定が返されませんでした",
		settingsUpdated: "設定を更新しました",
		modelSettingsSaved: "モデル設定を保存しました",
		restoreReasoning: "既定の推論強度に戻しました",
		restoreCapability: "既定の能力に戻しました",
		officialPreset: "公式プリセット",
		genericPreset: "汎用プリセット",
		subagentSaved: "Subagent の既定の推論強度を保存しました",
		quickSettings: "クイック設定",
		vendor: "プロバイダー",
		modelCount: "{count} 個のモデル",
		searchResults: "検索結果",
		model: "モデル",
		unsaved: "未保存",
		textEnabled: "テキスト入力：有効",
		textDisabled: "テキスト入力：無効",
		imageEnabled: "画像入力：有効",
		imageDisabled: "画像入力：無効",
		openModelSettings: "モデル設定を開く",
		closeModelSettings: "モデル設定を折りたたむ",
		contextLength: "コンテキスト長",
		oneMillionMode: "1M モード",
		inputCapabilities: "入力能力",
		textInput: "テキスト入力",
		imageInput: "画像入力",
		reasoningLevels: "推論強度",
		saveChanges: "変更を保存",
		saved: "保存済み",
		saveModelChanges: "モデルの変更を保存",
		noPendingChanges: "保存する変更はありません",
		expandedSettings: "{count} 個のモデル設定を展開中",
		collapseProvider: "プロバイダーを折りたたむ",
		expandProvider: "プロバイダーを展開",
		providerDefaultShort: "プロバイダーの既定値",
		contextTitle: "コンテキスト {value}",
		contextLabel: "コンテキスト {label}"
	},
	ko: {
		title: "타사 모델 추론 강도",
		description: "추론 강도를 선택하고 게이트웨이에 보낼 값을 입력합니다. 예를 들어 high에 ultra를 설정하면 Composer에서 High를 선택할 때 ultra가 전송됩니다. 설정이 없는 모델은 기본 선택 항목(Off / High / Max)을 사용합니다.",
		subagentTitle: "Subagent 추론 강도",
		currentDefault: "현재 기본값: {effort}",
		unconfiguredSubagent: "설정되지 않음 (Subagent가 제공자 기본값을 상속)",
		providerDefault: "제공자 기본값",
		apply: "적용",
		presetOfficial: "전체에 적용: Off / High / Max (공식 DeepSeek 방식)",
		presetGeneric: "전체에 적용: Off / Low / Medium / High (일반 방식)",
		searchPlaceholder: "모델 이름 또는 ID로 검색…",
		loading: "로드 중…",
		noModels: "수동으로 선언된 pi-ai 모델이 없습니다",
		noMatches: "일치하는 모델이 없습니다",
		noDeclared: "선언되지 않음",
		route: "라우트: {route}",
		customize: "추론 강도 사용자 지정",
		collapse: "접기",
		editorTitle: "추론 강도 편집 (단계를 선택하고 전송 값을 입력한 후 적용)",
		applyLevel: "추론 강도 적용",
		restoreDefault: "기본값 복원",
		expandedCount: "모델 {count}개 펼침",
		versionLabel: "플러그인 버전",
		languageLabel: "페이지 언어",
		languageChinese: "中文",
		languageEnglish: "English",
		languageJapanese: "日本語",
		languageKorean: "한국어",
		customPlaceholder: "사용자 지정 추론 강도 (예: ultra)",
		offPlaceholder: "비워 둠 = 전송하지 않음",
		wirePlaceholder: "사용자 지정 전송 값 (예: ultra)",
		noNamespace: "llm-pi-ai 설정 네임스페이스를 찾을 수 없습니다 (타사 모델 설정이 없습니다).",
		customEffortRequired: "사용자 지정 추론 강도를 입력하세요",
		levelNeedsValue: "추론 강도 {level}에는 전송 값이 필요합니다",
		atLeastThinking: "추론 강도를 하나 이상 선택하세요",
		readSettingsFailed: "설정을 읽지 못했습니다: {message}",
		writeFailed: "쓰기에 실패했습니다. 다시 시도하세요.",
		writeError: "쓰기에 실패했습니다: {message}",
		levelOff: "off",
		levelMinimal: "minimal",
		levelLow: "low",
		levelMedium: "medium",
		levelHigh: "high",
		levelXhigh: "xhigh",
		levelMax: "max",
		levelSuffix: " 추론 강도",
		pageTitle: "모델 기능 및 추론 강도",
		subagentCardTitle: "Subagent 기본 추론 강도",
		inputCapabilityMinimum: "입력 기능을 하나 이상 활성화하세요",
		contextInteger: "컨텍스트 길이는 정수여야 합니다 (2000-1000000)",
		contextRange: "컨텍스트 길이는 2000에서 1000000 사이여야 합니다",
		saveMissingNamespace: "저장했지만 최신 설정을 받지 못했습니다",
		settingsUpdated: "설정이 업데이트되었습니다",
		modelSettingsSaved: "모델 설정이 저장되었습니다",
		restoreReasoning: "기본 추론 강도를 복원했습니다",
		restoreCapability: "기본 기능을 복원했습니다",
		officialPreset: "공식 프리셋",
		genericPreset: "일반 프리셋",
		subagentSaved: "Subagent 기본 추론 강도가 저장되었습니다",
		quickSettings: "빠른 설정",
		vendor: "제공자",
		modelCount: "모델 {count}개",
		searchResults: "검색 결과",
		model: "모델",
		unsaved: "저장되지 않음",
		textEnabled: "텍스트 입력: 활성화됨",
		textDisabled: "텍스트 입력: 비활성화됨",
		imageEnabled: "이미지 입력: 활성화됨",
		imageDisabled: "이미지 입력: 비활성화됨",
		openModelSettings: "모델 설정 열기",
		closeModelSettings: "모델 설정 접기",
		contextLength: "컨텍스트 길이",
		oneMillionMode: "1M 모드",
		inputCapabilities: "입력 기능",
		textInput: "텍스트 입력",
		imageInput: "이미지 입력",
		reasoningLevels: "추론 강도",
		saveChanges: "변경 사항 저장",
		saved: "저장됨",
		saveModelChanges: "모델 변경 사항 저장",
		noPendingChanges: "저장할 변경 사항이 없습니다",
		expandedSettings: "모델 설정 {count}개 펼침",
		collapseProvider: "제공자 접기",
		expandProvider: "제공자 펼치기",
		providerDefaultShort: "제공자 기본값",
		contextTitle: "컨텍스트 {value}",
		contextLabel: "컨텍스트 {label}"
	}
};
//#endregion
//#region lib/types/compat/capabilities.js
function hasMethods(value, methods) {
	if (typeof value !== "object" && typeof value !== "function" || value === null) return false;
	return methods.every((method) => {
		let current = value;
		while (current !== null) {
			const descriptor = Object.getOwnPropertyDescriptor(current, method);
			if (descriptor === void 0) {
				current = Object.getPrototypeOf(current);
				continue;
			}
			return "value" in descriptor ? typeof descriptor.value === "function" : typeof Reflect.get(value, method) === "function";
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
function clientCapabilities(input) {
	return capabilities(hasMethods(input.remoteSettings, ["describe", "mutate"]) ? "remote" : hasMethods(input.legacySettings, ["describe", "mutate"]) ? "legacy" : "none", typeof input.addLanguage === "function");
}
//#endregion
//#region lib/types/compat/version-adapter.js
const semverPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?$/;
const verifiedProfiles = {
	"0.1.1-rc.2": "legacy",
	"0.1.1-rc.7": "legacy",
	"0.1.2-alpha.1": "modern"
};
function parseVersion(value) {
	if (typeof value !== "string") return void 0;
	return {
		value,
		valid: semverPattern.test(value)
	};
}
function profileForCapabilities(capabilities) {
	if (capabilities.settings === "remote") return "modern";
	if (capabilities.settings === "legacy") return "legacy";
	return "unknown";
}
function invalidVersionDiagnostic(version, capabilities) {
	return {
		code: "invalid-version",
		...version === void 0 ? {} : { version },
		actualCapabilities: capabilities,
		message: "Runtime version metadata is not a valid semver value."
	};
}
function mismatchDiagnostic(version, expectedProfile, capabilities) {
	return {
		code: "version-capability-mismatch",
		version,
		expectedProfile,
		actualCapabilities: capabilities,
		message: `Version metadata expects ${expectedProfile}, but detected capabilities select ${profileForCapabilities(capabilities)}.`
	};
}
function resolveCompatibility(input) {
	const { capabilities } = input;
	const actualProfile = profileForCapabilities(capabilities);
	const parsed = parseVersion(input.version);
	const diagnostics = [];
	if (input.version === void 0) return {
		profile: actualProfile,
		capabilities,
		diagnostics
	};
	if (parsed === void 0 || !parsed.valid) return {
		profile: "unknown",
		...parsed === void 0 ? {} : { version: parsed.value },
		capabilities,
		diagnostics: [invalidVersionDiagnostic(parsed?.value, capabilities)]
	};
	const expected = verifiedProfiles[parsed.value];
	if (expected === void 0) return {
		profile: actualProfile,
		version: parsed.value,
		capabilities,
		diagnostics
	};
	if (expected !== actualProfile) {
		diagnostics.push(mismatchDiagnostic(parsed.value, expected, capabilities));
		return {
			profile: actualProfile,
			version: parsed.value,
			expected,
			capabilities,
			diagnostics
		};
	}
	return {
		profile: expected,
		version: parsed.value,
		expected,
		capabilities,
		diagnostics
	};
}
//#endregion
//#region lib/types/client/settings-bridge.js
function directResult(response) {
	if (response !== null && typeof response === "object" && "result" in response) {
		const result = response.result;
		if (result !== null && typeof result === "object") return result;
	}
	return response;
}
function settingsBridge(connection, remoteSettings, addLanguage) {
	const legacySettings = connection?.api?.settings;
	const legacyCapabilities = clientCapabilities({
		legacySettings,
		addLanguage
	});
	if (legacyCapabilities.settings === "legacy" && legacySettings !== void 0) {
		const legacy = legacySettings;
		return {
			externalLanguages: legacyCapabilities.externalLanguages,
			describe: () => legacy.describe({}).then((response) => directResult(response)),
			mutate: (ns, ops, expectedRevision) => legacy.mutate({
				ns,
				ops,
				expectedRevision
			}).then((response) => directResult(response))
		};
	}
	const capabilities = clientCapabilities({
		remoteSettings,
		legacySettings,
		addLanguage
	});
	if (resolveCompatibility({ capabilities }).profile === "modern" && remoteSettings !== void 0) {
		const modern = remoteSettings;
		return {
			externalLanguages: capabilities.externalLanguages,
			describe: () => modern.describe().then((response) => directResult(response)),
			mutate: (ns, ops, expectedRevision) => modern.mutate(ns, ops, expectedRevision).then((response) => directResult(response))
		};
	}
}
//#endregion
//#region lib/types/client/constants.js
const ALL_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max"
];
const DEFAULT_LEVELS = {
	off: null,
	high: "high",
	max: "max"
};
const PRESETS = [{
	key: "official",
	levels: DEFAULT_LEVELS,
	labelKey: "presetOfficial"
}, {
	key: "generic",
	levels: {
		off: null,
		low: "low",
		medium: "medium",
		high: "high"
	},
	labelKey: "presetGeneric"
}];
const NS = "llm-pi-ai";
const LOCALE_NS = "settings.thinkingEffort";
const CONTEXT_MIN = 2e3;
const CONTEXT_1M = 1e6;
const CONTEXT_MAX = CONTEXT_1M;
const INPUT_MODALITIES = ["text", "image"];
const LEVEL_LABEL_KEYS = {
	off: "levelOff",
	minimal: "levelMinimal",
	low: "levelLow",
	medium: "levelMedium",
	high: "levelHigh",
	xhigh: "levelXhigh",
	max: "levelMax"
};
//#endregion
//#region package.json
var version = "0.1.11";
//#endregion
//#region lib/types/client/model-inventory.js
function record(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function modelItem(route, model, raw, index, inOverrides) {
	const levels = raw.reasoningEfforts === void 0 ? null : raw.reasoningEfforts;
	const contextWindow = Number.isInteger(raw.contextWindow) ? raw.contextWindow : void 0;
	const input = Array.isArray(raw.input) ? raw.input : [];
	return {
		route,
		model,
		name: typeof raw.name === "string" && raw.name.length > 0 ? raw.name : model,
		levels,
		contextWindow,
		input,
		raw,
		index,
		inOverrides
	};
}
function inventoryFrom(namespace) {
	const providers = record(record(record(namespace)?.value)?.providers);
	if (!providers) return [];
	const inventory = [];
	for (const [route, profileValue] of Object.entries(providers)) {
		const profile = record(profileValue);
		if (!profile) continue;
		if (Array.isArray(profile.models)) profile.models.forEach((entry, index) => {
			const raw = record(entry);
			const model = typeof raw?.id === "string" ? raw.id : void 0;
			if (raw && model !== void 0) inventory.push(modelItem(route, model, raw, index, false));
		});
		const overrides = record(profile.modelOverrides);
		if (overrides) for (const [model, entry] of Object.entries(overrides)) inventory.push(modelItem(route, model, record(entry) ?? {}, -1, true));
	}
	return inventory;
}
//#endregion
//#region lib/types/client/model-ops.js
function mergeModelUpdate(raw, update) {
	const next = { ...raw };
	if (update.levels !== void 0) next.reasoningEfforts = update.levels;
	if (update.contextWindowTouched === true) {
		if (update.contextWindow === void 0) delete next.contextWindow;
		else next.contextWindow = update.contextWindow;
	}
	if (update.inputTouched === true) {
		if (update.input === void 0) delete next.input;
		else next.input = update.input;
	}
	return next;
}
function setOps(inventory, updates) {
	const groups = /* @__PURE__ */ new Map();
	for (const update of updates) {
		const { item } = update;
		if (!item) continue;
		const type = item.inOverrides ? "modelOverrides" : "models";
		const key = `${item.route}\u0000${type}`;
		const group = groups.get(key) ?? {
			route: item.route,
			type,
			updates: []
		};
		group.updates.push(update);
		groups.set(key, group);
	}
	return [...groups.values()].map((group) => {
		const candidates = inventory.filter((candidate) => candidate.route === group.route && (group.type === "modelOverrides" ? candidate.inOverrides : !candidate.inOverrides));
		if (group.type === "modelOverrides") {
			const overrides = Object.fromEntries(candidates.map((candidate) => [candidate.model, { ...candidate.raw }]));
			for (const update of group.updates) {
				const model = update.item.model;
				const current = Object.prototype.hasOwnProperty.call(overrides, model) ? overrides[model] : {};
				Object.defineProperty(overrides, model, {
					configurable: true,
					enumerable: true,
					value: mergeModelUpdate(current, update),
					writable: true
				});
			}
			return {
				op: "set",
				path: [
					"providers",
					group.route,
					"modelOverrides"
				],
				value: overrides
			};
		}
		const models = [...candidates].sort((a, b) => a.index - b.index).map((candidate) => {
			const update = group.updates.find((entry) => entry.item.index === candidate.index && entry.item.model === candidate.model);
			return update ? mergeModelUpdate({ ...candidate.raw }, update) : { ...candidate.raw };
		});
		return {
			op: "set",
			path: [
				"providers",
				group.route,
				"models"
			],
			value: models
		};
	});
}
//#endregion
//#region lib/types/client/validation.js
function draftFrom(levels) {
	const draft = {};
	for (const level of ALL_LEVELS) {
		const value = levels?.[level];
		const wire = value === void 0 ? "" : value === null ? "" : String(value);
		draft[level] = {
			on: wire !== "" || level === "off" && levels?.off === null,
			wire
		};
	}
	return draft;
}
function buildLevels(draft) {
	const output = {};
	for (const level of ALL_LEVELS) {
		const cell = draft[level];
		if (!cell?.on) continue;
		output[level] = level === "off" ? cell.wire.trim() === "" ? null : cell.wire.trim() : cell.wire.trim();
	}
	return output;
}
function contextDraftFrom(item) {
	const contextWindow = Number.isInteger(item.contextWindow) ? item.contextWindow : void 0;
	const value = contextWindow === void 0 ? "" : String(contextWindow);
	return {
		value,
		oneMillion: contextWindow === CONTEXT_1M,
		previousValue: contextWindow === 1e6 ? "" : value,
		touched: false
	};
}
function inputDraftFrom(item) {
	const declared = Array.isArray(item.input) ? item.input : [];
	const effective = declared.length > 0 ? declared : ["text"];
	return {
		text: effective.includes("text"),
		image: effective.includes("image"),
		touched: false
	};
}
function buildInput(draft, translate) {
	if (!draft) return { value: void 0 };
	const value = INPUT_MODALITIES.filter((modality) => draft[modality] === true);
	return value.length === 0 ? { error: translate("inputCapabilityMinimum") } : { value };
}
function validateContextWindow(draft, translate) {
	if (!draft) return { value: void 0 };
	if (draft.oneMillion) return { value: CONTEXT_1M };
	const raw = typeof draft.value === "string" ? draft.value.trim() : "";
	if (raw === "") return { value: void 0 };
	if (!/^\d+$/.test(raw)) return { error: translate("contextInteger") };
	const value = Number(raw);
	if (!Number.isSafeInteger(value) || value < 2e3 || value > 1e6) return { error: translate("contextRange") };
	return { value };
}
function validateLevels(levels, translate) {
	let hasThinking = false;
	for (const [level, wire] of Object.entries(levels)) {
		if (level === "off") continue;
		hasThinking = true;
		if (typeof wire !== "string" || wire.length === 0) return translate("levelNeedsValue", { level: translate(LEVEL_LABEL_KEYS[level] ?? level) });
	}
	return hasThinking ? null : translate("atLeastThinking");
}
//#endregion
//#region lib/types/client/theme.js
function isDark(environment) {
	if (environment?.backgroundColor !== void 0) {
		const values = environment.backgroundColor.match(/\d+(?:\.\d+)?/g);
		const alpha = values && values.length > 3 ? Number(values[3]) : 1;
		if (values && values.length >= 3 && alpha > 0) {
			const rgb = values.slice(0, 3).map(Number);
			return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722 < 145;
		}
	}
	if (environment?.prefersDark !== void 0) return environment.prefersDark;
	return true;
}
function iosPalette(environment) {
	let dark = true;
	if (environment === void 0) try {
		const body = typeof document === "undefined" ? void 0 : document.body;
		dark = isDark({
			backgroundColor: body === void 0 ? void 0 : getComputedStyle(body).backgroundColor,
			prefersDark: typeof window === "undefined" || typeof window.matchMedia !== "function" ? void 0 : window.matchMedia("(prefers-color-scheme: dark)").matches
		});
	} catch {
		dark = true;
	}
	else dark = isDark(environment);
	return dark ? {
		canvas: "#1C1C1E",
		group: "#2C2C2E",
		raised: "#3A3A3C",
		field: "#2C2C2E",
		border: "rgba(255,255,255,0.12)",
		divider: "rgba(255,255,255,0.10)",
		text: "#F5F5F7",
		secondary: "rgba(235,235,245,0.60)",
		accent: "#0A84FF",
		accentSoft: "rgba(10,132,255,0.16)",
		accentBorder: "rgba(10,132,255,0.42)",
		switchOff: "#39393D",
		danger: "#FF453A",
		dangerBg: "rgba(255,69,58,0.16)",
		dangerBorder: "rgba(255,69,58,0.30)",
		shadow: "0 1px 1px rgba(0,0,0,0.24)"
	} : {
		canvas: "#F2F2F7",
		group: "#FFFFFF",
		raised: "#F9F9FB",
		field: "#F2F2F7",
		border: "rgba(60,60,67,0.18)",
		divider: "rgba(60,60,67,0.18)",
		text: "#1C1C1E",
		secondary: "#6D6D72",
		accent: "#007AFF",
		accentSoft: "rgba(0,122,255,0.10)",
		accentBorder: "rgba(0,122,255,0.32)",
		switchOff: "#E5E5EA",
		danger: "#FF3B30",
		dangerBg: "rgba(255,59,48,0.12)",
		dangerBorder: "rgba(255,59,48,0.28)",
		shadow: "0 1px 1px rgba(0,0,0,0.05)"
	};
}
//#endregion
//#region lib/types/client/components/Controls.js
function Icon({ name, size = 15 }) {
	const children = [];
	if (name === "sliders" || name === "settings") children.push((0, react_jsx_runtime.jsx)("path", { d: "M4 6h16M4 12h16M4 18h16" }, "lines"), (0, react_jsx_runtime.jsx)("circle", {
		cx: "8",
		cy: "6",
		r: "2"
	}, "a"), (0, react_jsx_runtime.jsx)("circle", {
		cx: "15",
		cy: "12",
		r: "2"
	}, "b"), (0, react_jsx_runtime.jsx)("circle", {
		cx: "10",
		cy: "18",
		r: "2"
	}, "c"));
	else if (name === "chevronDown") children.push((0, react_jsx_runtime.jsx)("path", { d: "m6 9 6 6 6-6" }, "path"));
	else if (name === "chevronUp") children.push((0, react_jsx_runtime.jsx)("path", { d: "m18 15-6-6-6 6" }, "path"));
	else if (name === "check") children.push((0, react_jsx_runtime.jsx)("path", { d: "m5 12 4 4L19 6" }, "path"));
	else if (name === "restore") children.push((0, react_jsx_runtime.jsx)("path", { d: "M9 7H5v4" }, "arrow"), (0, react_jsx_runtime.jsx)("path", { d: "M5 11a7 7 0 1 1 2 6" }, "curve"));
	else if (name === "search") children.push((0, react_jsx_runtime.jsx)("circle", {
		cx: "11",
		cy: "11",
		r: "6.5"
	}, "circle"), (0, react_jsx_runtime.jsx)("path", { d: "m16 16 4 4" }, "handle"));
	else if (name === "layers") children.push((0, react_jsx_runtime.jsx)("path", { d: "m12 3 8 4-8 4-8-4 8-4Z" }, "top"), (0, react_jsx_runtime.jsx)("path", { d: "m4 12 8 4 8-4" }, "middle"), (0, react_jsx_runtime.jsx)("path", { d: "m4 17 8 4 8-4" }, "bottom"));
	else if (name === "text") children.push((0, react_jsx_runtime.jsx)("path", { d: "M5 5h14M12 5v14M8 19h8" }, "path"));
	else if (name === "image") children.push((0, react_jsx_runtime.jsx)("rect", {
		x: "3",
		y: "4",
		width: "18",
		height: "16",
		rx: "2"
	}, "rect"), (0, react_jsx_runtime.jsx)("circle", {
		cx: "8.5",
		cy: "9",
		r: "1.5"
	}, "circle"), (0, react_jsx_runtime.jsx)("path", { d: "m4 17 5-5 3 3 2-2 6 4" }, "mountain"));
	else if (name === "model") children.push((0, react_jsx_runtime.jsx)("path", { d: "m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" }, "box"), (0, react_jsx_runtime.jsx)("path", { d: "m4 7.5 8 4.5 8-4.5" }, "top"), (0, react_jsx_runtime.jsx)("path", { d: "M12 12v9" }, "side"));
	else if (name === "context") children.push((0, react_jsx_runtime.jsx)("path", { d: "M8 4H5v16h3M16 4h3v16h-3" }, "brackets"), (0, react_jsx_runtime.jsx)("path", { d: "M10 8h4M10 12h4M10 16h4" }, "lines"));
	else if (name === "sparkles") children.push((0, react_jsx_runtime.jsx)("path", { d: "m12 3-1.2 4.8L6 9l4.8 1.2L12 15l1.2-4.8L18 9l-4.8-1.2L12 3Z" }, "large"), (0, react_jsx_runtime.jsx)("path", { d: "m19 14-.7 2.3L16 17l2.3.7L19 20l.7-2.3L22 17l-2.3-.7L19 14Z" }, "small"));
	return (0, react_jsx_runtime.jsx)("svg", {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 1.8,
		strokeLinecap: "round",
		strokeLinejoin: "round",
		"aria-hidden": "true",
		focusable: "false",
		style: {
			display: "block",
			flex: "0 0 auto"
		},
		children
	});
}
function ActionButton({ text = "", onClick, disabled = false, tone = "secondary", palette, icon, label, children }) {
	const visual = tone === "primary" ? {
		background: palette.accent,
		color: "#FFFFFF",
		border: palette.accent
	} : tone === "danger" ? {
		background: palette.dangerBg,
		color: palette.danger,
		border: palette.dangerBorder
	} : tone === "ghost" ? {
		background: "transparent",
		color: palette.accent,
		border: "transparent"
	} : {
		background: palette.field,
		color: palette.text,
		border: palette.border
	};
	const iconOnly = text.length === 0 && children === void 0;
	return (0, react_jsx_runtime.jsxs)("button", {
		type: "button",
		title: label,
		"aria-label": label,
		disabled,
		onClick,
		style: {
			height: "28px",
			minWidth: "28px",
			width: iconOnly ? "28px" : void 0,
			padding: iconOnly ? 0 : "0 9px",
			borderRadius: "8px",
			border: `1px solid ${visual.border}`,
			backgroundColor: visual.background,
			color: visual.color,
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			gap: "5px",
			fontSize: "12px",
			fontWeight: 600,
			letterSpacing: 0,
			whiteSpace: "nowrap",
			cursor: disabled ? "default" : "pointer",
			opacity: disabled ? .5 : 1,
			boxShadow: tone === "primary" ? palette.shadow : "none",
			transition: "background-color 150ms ease, opacity 150ms ease, transform 150ms ease"
		},
		children: [icon ? (0, react_jsx_runtime.jsx)(Icon, {
			name: icon,
			size: 14
		}) : null, text ? (0, react_jsx_runtime.jsx)("span", { children: text }) : children]
	});
}
function SwitchControl({ checked, onChange, disabled = false, label, palette }) {
	return (0, react_jsx_runtime.jsx)("button", {
		type: "button",
		role: "switch",
		"aria-checked": checked,
		"aria-label": label,
		title: label,
		disabled,
		onClick: () => onChange(!checked),
		style: {
			width: "44px",
			height: "26px",
			minWidth: "44px",
			padding: 0,
			position: "relative",
			border: `1px solid ${checked ? palette.accent : palette.border}`,
			borderRadius: "13px",
			backgroundColor: checked ? palette.accent : palette.switchOff,
			cursor: disabled ? "default" : "pointer",
			opacity: disabled ? .5 : 1,
			transition: "background-color 160ms ease, border-color 160ms ease"
		},
		children: (0, react_jsx_runtime.jsx)("span", { style: {
			position: "absolute",
			top: "2px",
			left: "2px",
			width: "20px",
			height: "20px",
			borderRadius: "10px",
			backgroundColor: "#FFFFFF",
			boxShadow: "0 1px 2px rgba(0,0,0,0.25)",
			transform: checked ? "translateX(18px)" : "translateX(0)",
			transition: "transform 160ms ease"
		} })
	});
}
//#endregion
//#region lib/types/client/components/ModelEditor.js
function ModelEditor({ item, draft, contextDraft, inputDraft, dirty, busy, palette, t, onLevelChange, onContextChange, onOneMillionChange, onInputChange, onSave, onRestoreReasoning, onRestoreCapability }) {
	const levelLabel = (level) => t(LEVEL_LABEL_KEYS[level]);
	return (0, react_jsx_runtime.jsxs)("div", {
		style: {
			padding: "8px",
			borderTop: `1px solid ${palette.divider}`,
			backgroundColor: palette.group
		},
		children: [
			(0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "grid",
					gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
					gap: "6px",
					marginBottom: "6px"
				},
				children: [(0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "grid",
						gridTemplateColumns: "auto minmax(0, 1fr) auto",
						alignItems: "center",
						gap: "8px",
						minWidth: 0,
						padding: "7px",
						border: `1px solid ${palette.border}`,
						borderRadius: "8px",
						backgroundColor: palette.field
					},
					children: [
						(0, react_jsx_runtime.jsxs)("span", {
							style: {
								display: "flex",
								alignItems: "center",
								gap: "6px",
								fontSize: "13px",
								fontWeight: 650
							},
							children: [(0, react_jsx_runtime.jsx)(Icon, {
								name: "context",
								size: 15
							}), (0, react_jsx_runtime.jsx)("span", { children: t("contextLength") })]
						}),
						(0, react_jsx_runtime.jsx)("input", {
							type: "number",
							inputMode: "numeric",
							min: CONTEXT_MIN,
							max: CONTEXT_MAX,
							step: 1,
							value: contextDraft.oneMillion ? String(CONTEXT_1M) : contextDraft.value,
							disabled: busy || contextDraft.oneMillion,
							placeholder: t("providerDefaultShort"),
							"aria-label": t("contextLength"),
							onChange: (event) => onContextChange(event.currentTarget.value),
							style: {
								boxSizing: "border-box",
								width: "100%",
								minWidth: 0,
								height: "28px",
								padding: "0 8px",
								border: `1px solid ${palette.border}`,
								borderRadius: "8px",
								fontSize: "13px",
								backgroundColor: palette.group,
								color: palette.text,
								outline: "none"
							}
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								justifyContent: "flex-end",
								gap: "6px",
								minWidth: 0,
								fontSize: "12px",
								whiteSpace: "nowrap"
							},
							children: [(0, react_jsx_runtime.jsx)("span", { children: t("oneMillionMode") }), (0, react_jsx_runtime.jsx)(SwitchControl, {
								checked: contextDraft.oneMillion,
								onChange: onOneMillionChange,
								disabled: busy,
								label: t("oneMillionMode"),
								palette
							})]
						})
					]
				}), (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "grid",
						gridTemplateColumns: "auto minmax(0, 1fr) minmax(0, 1fr)",
						alignItems: "center",
						gap: "8px",
						minWidth: 0,
						padding: "7px",
						border: `1px solid ${palette.border}`,
						borderRadius: "8px",
						backgroundColor: palette.field
					},
					children: [
						(0, react_jsx_runtime.jsx)("span", {
							style: {
								fontSize: "13px",
								fontWeight: 650
							},
							children: t("inputCapabilities")
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								justifyContent: "flex-end",
								gap: "6px",
								minWidth: 0,
								fontSize: "12px",
								whiteSpace: "nowrap"
							},
							children: [(0, react_jsx_runtime.jsxs)("span", {
								style: {
									display: "inline-flex",
									alignItems: "center",
									gap: "5px"
								},
								children: [(0, react_jsx_runtime.jsx)(Icon, {
									name: "text",
									size: 14
								}), (0, react_jsx_runtime.jsx)("span", { children: t("textInput") })]
							}), (0, react_jsx_runtime.jsx)(SwitchControl, {
								checked: inputDraft.text,
								onChange: (enabled) => onInputChange("text", enabled),
								disabled: busy,
								label: t("textInput"),
								palette
							})]
						}),
						(0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								justifyContent: "flex-end",
								gap: "6px",
								minWidth: 0,
								fontSize: "12px",
								whiteSpace: "nowrap"
							},
							children: [(0, react_jsx_runtime.jsxs)("span", {
								style: {
									display: "inline-flex",
									alignItems: "center",
									gap: "5px"
								},
								children: [(0, react_jsx_runtime.jsx)(Icon, {
									name: "image",
									size: 14
								}), (0, react_jsx_runtime.jsx)("span", { children: t("imageInput") })]
							}), (0, react_jsx_runtime.jsx)(SwitchControl, {
								checked: inputDraft.image,
								onChange: (enabled) => onInputChange("image", enabled),
								disabled: busy,
								label: t("imageInput"),
								palette
							})]
						})
					]
				})]
			}),
			(0, react_jsx_runtime.jsx)("div", {
				style: {
					fontSize: "12px",
					fontWeight: 700,
					color: palette.secondary,
					margin: "0 0 4px 2px"
				},
				children: t("reasoningLevels")
			}),
			(0, react_jsx_runtime.jsx)("div", {
				style: {
					display: "grid",
					gridTemplateColumns: "minmax(0, 1fr)",
					marginBottom: "2px",
					border: `1px solid ${palette.border}`,
					borderRadius: "8px",
					backgroundColor: palette.field,
					overflow: "hidden"
				},
				children: ALL_LEVELS.map((level, index) => {
					const cell = draft[level] ?? {
						on: false,
						wire: ""
					};
					return (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "grid",
							gridTemplateColumns: "44px 58px minmax(0, 1fr)",
							alignItems: "center",
							gap: "8px",
							minHeight: "30px",
							padding: "2px 8px",
							borderBottom: index < ALL_LEVELS.length - 1 ? `1px solid ${palette.divider}` : "none",
							backgroundColor: cell.on ? palette.raised : "transparent",
							fontSize: "12px"
						},
						children: [
							(0, react_jsx_runtime.jsx)(SwitchControl, {
								checked: cell.on,
								onChange: (enabled) => onLevelChange(level, { on: enabled }),
								disabled: busy,
								label: `${levelLabel(level)}${t("levelSuffix")}`,
								palette
							}),
							(0, react_jsx_runtime.jsx)("span", {
								style: {
									width: "58px",
									fontSize: "13px",
									fontWeight: 650
								},
								children: levelLabel(level)
							}),
							cell.on ? (0, react_jsx_runtime.jsx)("input", {
								type: "text",
								value: cell.wire,
								disabled: busy,
								placeholder: level === "off" ? t("offPlaceholder") : t("wirePlaceholder"),
								onChange: (event) => onLevelChange(level, { wire: event.currentTarget.value }),
								style: {
									boxSizing: "border-box",
									width: "100%",
									minWidth: 0,
									height: "26px",
									padding: "0 8px",
									border: `1px solid ${palette.border}`,
									borderRadius: "8px",
									fontSize: "13px",
									backgroundColor: palette.group,
									color: palette.text,
									outline: "none"
								}
							}) : null
						]
					}, level);
				})
			}),
			(0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					gap: "6px",
					flexWrap: "wrap",
					marginTop: "6px",
					paddingTop: "6px",
					borderTop: `1px solid ${palette.divider}`
				},
				children: [
					(0, react_jsx_runtime.jsx)(ActionButton, {
						text: dirty ? t("saveChanges") : t("saved"),
						onClick: onSave,
						disabled: busy || !dirty,
						tone: "primary",
						palette,
						icon: "check",
						label: dirty ? t("saveModelChanges") : t("noPendingChanges")
					}),
					(0, react_jsx_runtime.jsx)(ActionButton, {
						text: t("restoreReasoning"),
						onClick: onRestoreReasoning,
						disabled: busy,
						tone: "secondary",
						palette,
						icon: "restore"
					}),
					(0, react_jsx_runtime.jsx)(ActionButton, {
						text: t("restoreCapability"),
						onClick: onRestoreCapability,
						disabled: busy,
						tone: "danger",
						palette,
						icon: "restore"
					})
				]
			})
		]
	});
}
//#endregion
//#region lib/types/client/components/ModelRow.js
function modelSummary(item, t) {
	const input = item.input.length > 0 ? item.input : ["text"];
	const value = item.contextWindow;
	return {
		text: input.includes("text"),
		image: input.includes("image"),
		context: Number.isInteger(value) ? {
			label: value === 1e6 ? "1M" : value >= 1024 ? `${Math.round(value / 1024)}K` : String(value),
			title: t("contextTitle", { value })
		} : void 0
	};
}
function ModelRow({ item, open, draft, contextDraft, inputDraft, dirty, busy, palette, t, onToggle, onLevelChange, onContextChange, onOneMillionChange, onInputChange, onSave, onRestoreReasoning, onRestoreCapability }) {
	const summary = modelSummary(item, t);
	return (0, react_jsx_runtime.jsxs)("div", {
		style: {
			border: `1px solid ${open ? palette.accent : dirty ? palette.accentBorder : palette.border}`,
			borderRadius: "8px",
			marginBottom: "4px",
			backgroundColor: open ? palette.raised : palette.group,
			boxShadow: palette.shadow,
			overflow: "hidden",
			transition: "background-color 160ms ease, border-color 160ms ease"
		},
		children: [(0, react_jsx_runtime.jsxs)("div", {
			style: {
				display: "grid",
				gridTemplateColumns: "minmax(0, 1fr) auto",
				alignItems: "center",
				columnGap: "8px",
				minHeight: "42px",
				padding: "4px 6px 4px 8px"
			},
			children: [(0, react_jsx_runtime.jsxs)("span", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: "7px",
					minWidth: 0
				},
				children: [(0, react_jsx_runtime.jsx)("span", {
					style: {
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						width: "22px",
						height: "22px",
						minWidth: "22px",
						borderRadius: "7px",
						color: palette.accent,
						backgroundColor: palette.field
					},
					children: (0, react_jsx_runtime.jsx)(Icon, {
						name: "model",
						size: 14
					})
				}), (0, react_jsx_runtime.jsxs)("span", {
					style: {
						display: "grid",
						gap: "1px",
						minWidth: 0
					},
					children: [(0, react_jsx_runtime.jsx)("span", {
						style: {
							minWidth: 0,
							fontSize: "13px",
							lineHeight: "15px",
							fontWeight: 700,
							overflowWrap: "anywhere"
						},
						children: item.model
					}), (0, react_jsx_runtime.jsxs)("span", {
						style: {
							display: "flex",
							alignItems: "center",
							gap: "5px",
							fontSize: "10px",
							lineHeight: "11px",
							color: palette.secondary
						},
						children: [(0, react_jsx_runtime.jsx)("span", { children: t("model") }), dirty ? (0, react_jsx_runtime.jsx)("span", {
							title: t("unsaved"),
							style: {
								padding: "1px 4px",
								border: `1px solid ${palette.accentBorder}`,
								borderRadius: "5px",
								color: palette.accent,
								backgroundColor: palette.accentSoft,
								fontSize: "9px",
								lineHeight: "11px",
								fontWeight: 700
							},
							children: t("unsaved")
						}) : null]
					})]
				})]
			}), (0, react_jsx_runtime.jsxs)("span", {
				style: {
					display: "grid",
					gridTemplateColumns: "154px 28px",
					columnGap: "8px",
					alignItems: "center"
				},
				children: [(0, react_jsx_runtime.jsxs)("span", {
					style: {
						display: "grid",
						gridTemplateColumns: "22px 22px minmax(86px, 1fr)",
						columnGap: "8px",
						alignItems: "center",
						color: palette.secondary
					},
					children: [
						(0, react_jsx_runtime.jsx)("span", {
							title: summary.text ? t("textEnabled") : t("textDisabled"),
							"aria-label": summary.text ? t("textEnabled") : t("textDisabled"),
							style: {
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
								width: "22px",
								height: "22px",
								color: summary.text ? palette.accent : palette.secondary,
								border: `1px solid ${summary.text ? palette.accentBorder : palette.border}`,
								borderRadius: "6px",
								backgroundColor: summary.text ? palette.accentSoft : palette.raised
							},
							children: (0, react_jsx_runtime.jsx)(Icon, {
								name: "text",
								size: 14
							})
						}),
						(0, react_jsx_runtime.jsx)("span", {
							title: summary.image ? t("imageEnabled") : t("imageDisabled"),
							"aria-label": summary.image ? t("imageEnabled") : t("imageDisabled"),
							style: {
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
								width: "22px",
								height: "22px",
								color: summary.image ? palette.accent : palette.secondary,
								border: `1px solid ${summary.image ? palette.accentBorder : palette.border}`,
								borderRadius: "6px",
								backgroundColor: summary.image ? palette.accentSoft : palette.raised
							},
							children: (0, react_jsx_runtime.jsx)(Icon, {
								name: "image",
								size: 14
							})
						}),
						(0, react_jsx_runtime.jsx)("span", {
							title: summary.context?.title,
							"aria-label": summary.context?.title,
							style: {
								display: "inline-flex",
								alignItems: "center",
								gap: "4px",
								minHeight: "22px",
								padding: summary.context ? "0 5px" : 0,
								border: summary.context ? `1px solid ${palette.border}` : "1px solid transparent",
								borderRadius: "6px",
								backgroundColor: summary.context ? palette.raised : "transparent",
								whiteSpace: "nowrap"
							},
							children: summary.context ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)(Icon, {
								name: "context",
								size: 14
							}), (0, react_jsx_runtime.jsx)("span", {
								style: {
									fontSize: "11px",
									fontWeight: 700
								},
								children: t("contextLabel", { label: summary.context.label })
							})] }) : null
						})
					]
				}), (0, react_jsx_runtime.jsx)(ActionButton, {
					text: "",
					onClick: onToggle,
					palette,
					tone: "ghost",
					icon: open ? "chevronUp" : "settings",
					label: open ? t("closeModelSettings") : t("openModelSettings")
				})]
			})]
		}), open && draft ? (0, react_jsx_runtime.jsx)(ModelEditor, {
			item,
			draft,
			contextDraft,
			inputDraft,
			dirty,
			busy,
			palette,
			t,
			onLevelChange,
			onContextChange,
			onOneMillionChange,
			onInputChange,
			onSave,
			onRestoreReasoning,
			onRestoreCapability
		}) : null]
	});
}
//#endregion
//#region lib/types/client/components/SubagentSettings.js
function SubagentSettings({ effort, namespaceFound, draft, custom, busy, palette, t, onDraftChange, onCustomChange, onSave }) {
	const options = [
		["default", t("providerDefault")],
		...ALL_LEVELS.map((level) => [level, t(LEVEL_LABEL_KEYS[level])]),
		["custom", t("customize")]
	];
	return (0, react_jsx_runtime.jsxs)("div", {
		style: {
			backgroundColor: palette.group,
			border: `1px solid ${palette.border}`,
			borderRadius: "8px",
			boxShadow: palette.shadow,
			overflow: "hidden",
			marginBottom: "8px"
		},
		children: [
			(0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: "7px",
					padding: "7px 8px 1px",
					fontSize: "13px",
					fontWeight: 700,
					letterSpacing: 0
				},
				children: [(0, react_jsx_runtime.jsx)(Icon, {
					name: "sparkles",
					size: 15
				}), (0, react_jsx_runtime.jsx)("span", { children: t("subagentCardTitle") })]
			}),
			(0, react_jsx_runtime.jsx)("div", {
				style: {
					padding: "0 8px",
					fontSize: "12px",
					color: palette.secondary,
					marginBottom: "5px"
				},
				children: namespaceFound ? t("currentDefault", { effort: effort ?? t("providerDefault") }) : t("unconfiguredSubagent")
			}),
			(0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					gap: "8px",
					flexWrap: "wrap",
					alignItems: "center",
					padding: "6px 8px 7px",
					borderTop: `1px solid ${palette.divider}`
				},
				children: [
					(0, react_jsx_runtime.jsx)("select", {
						value: draft,
						disabled: busy,
						onChange: (event) => onDraftChange(event.currentTarget.value),
						style: {
							height: "28px",
							minWidth: "136px",
							padding: "0 10px",
							border: `1px solid ${palette.border}`,
							borderRadius: "8px",
							fontSize: "13px",
							fontWeight: 500,
							backgroundColor: palette.field,
							color: palette.text,
							colorScheme: "light dark",
							boxShadow: palette.shadow
						},
						children: options.map(([value, label]) => (0, react_jsx_runtime.jsx)("option", {
							value,
							children: label
						}, value))
					}),
					draft === "custom" ? (0, react_jsx_runtime.jsx)("input", {
						type: "text",
						value: custom,
						placeholder: t("customPlaceholder"),
						"aria-label": t("customPlaceholder"),
						onChange: (event) => onCustomChange(event.currentTarget.value),
						style: {
							flex: "1 1 160px",
							minWidth: "140px",
							height: "28px",
							padding: "0 8px",
							border: `1px solid ${palette.border}`,
							borderRadius: "8px",
							fontSize: "13px",
							backgroundColor: palette.field,
							color: palette.text,
							outline: "none"
						}
					}) : null,
					(0, react_jsx_runtime.jsx)(ActionButton, {
						text: t("apply"),
						onClick: onSave,
						disabled: busy,
						tone: "primary",
						palette,
						icon: "check"
					})
				]
			})
		]
	});
}
//#endregion
//#region lib/types/client/SectionEditor.js
const PLUGIN_VERSION = version;
const initialState = {
	loading: true,
	inventory: [],
	revision: 0,
	expanded: {},
	expandedProviders: {},
	drafts: {},
	contextDrafts: {},
	inputDrafts: {},
	dirty: {},
	busy: false,
	error: null,
	notice: null,
	query: "",
	nsFound: true,
	subagent: null,
	subagentDraft: "default",
	subagentCustom: "",
	quickSettingsOpen: false
};
function keyOf(item) {
	return `${item.route}/${item.model}`;
}
function revisionOf(namespace) {
	return typeof namespace.revision === "number" ? namespace.revision : 0;
}
function removeDirtyFields(dirty, key, fields) {
	const next = { ...dirty };
	const entry = { ...next[key] ?? {} };
	fields.forEach((field) => {
		delete entry[field];
	});
	if (Object.keys(entry).length === 0) delete next[key];
	else next[key] = entry;
	return next;
}
function subagentView(namespace) {
	if (!namespace) return {
		subagent: null,
		draft: "default",
		custom: "",
		revision: 0
	};
	const revision = revisionOf(namespace);
	const user = namespace.user ?? {};
	const effort = typeof user.subagentEffort === "string" && user.subagentEffort.length > 0 ? user.subagentEffort : null;
	const draft = effort === null ? "default" : ALL_LEVELS.includes(effort) ? effort : "custom";
	return {
		subagent: {
			effort,
			revision
		},
		draft,
		custom: draft === "custom" ? effort ?? "" : "",
		revision
	};
}
function SectionEditor({ settings, locale, t, palette = iosPalette() }) {
	const [state, setState] = react.default.useState(initialState);
	const applyNamespaceView = (current, nextNamespace, notice) => {
		const view = subagentView(nextNamespace);
		return {
			...current,
			loading: false,
			busy: false,
			nsFound: true,
			inventory: inventoryFrom(nextNamespace),
			revision: revisionOf(nextNamespace),
			subagent: view.subagent,
			subagentDraft: view.draft,
			subagentCustom: view.custom,
			notice
		};
	};
	const load = () => {
		setState((current) => ({
			...current,
			loading: true,
			error: null
		}));
		settings.describe().then((response) => {
			if (!response.ok) {
				setState((current) => ({
					...current,
					loading: false,
					busy: false,
					error: response.error.message
				}));
				return;
			}
			const found = response.value.namespaces.find((entry) => entry.ns === NS);
			if (!found) {
				setState((current) => ({
					...current,
					loading: false,
					busy: false,
					nsFound: false,
					inventory: [],
					subagent: null
				}));
				return;
			}
			const view = subagentView(found);
			setState((current) => ({
				...current,
				loading: false,
				busy: false,
				nsFound: true,
				inventory: inventoryFrom(found),
				revision: revisionOf(found),
				subagent: view.subagent,
				subagentDraft: view.draft,
				subagentCustom: view.custom
			}));
		}).catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			setState((current) => ({
				...current,
				loading: false,
				busy: false,
				error: t("readSettingsFailed", { message })
			}));
		});
	};
	react.default.useEffect(() => {
		load();
	}, []);
	const runOps = (ops, successMessage, onSuccess) => {
		setState((current) => ({
			...current,
			busy: true,
			error: null,
			notice: null
		}));
		settings.mutate(NS, ops, state.revision).then((response) => {
			if (!response.ok) {
				setState((current) => ({
					...current,
					busy: false,
					error: t("writeError", { message: response.error.message })
				}));
				return;
			}
			if (!response.value || typeof response.value !== "object") {
				setState((current) => ({
					...current,
					busy: false,
					error: t("saveMissingNamespace")
				}));
				return;
			}
			onSuccess?.();
			setState((current) => applyNamespaceView(current, response.value, successMessage));
		}).catch((error) => {
			const message = error instanceof Error ? error.message : String(error);
			setState((current) => ({
				...current,
				busy: false,
				error: message.length > 0 ? t("writeError", { message }) : t("writeFailed")
			}));
		});
	};
	const applyModel = (item) => {
		const key = keyOf(item);
		const levels = buildLevels(state.drafts[key] ?? {});
		const levelError = validateLevels(levels, t);
		if (levelError) {
			setState((current) => ({
				...current,
				error: levelError
			}));
			return;
		}
		const contextDraft = state.contextDrafts[key] ?? contextDraftFrom(item);
		const context = contextDraft.touched ? validateContextWindow(contextDraft, t) : { value: void 0 };
		if (context.error) {
			const error = context.error;
			setState((current) => ({
				...current,
				error
			}));
			return;
		}
		const inputDraft = state.inputDrafts[key] ?? inputDraftFrom(item);
		const input = inputDraft.touched ? buildInput(inputDraft, t) : { value: void 0 };
		if (input.error) {
			const error = input.error;
			setState((current) => ({
				...current,
				error
			}));
			return;
		}
		const update = {
			item,
			levels,
			contextWindow: context.value,
			contextWindowTouched: contextDraft.touched,
			input: input.value,
			inputTouched: inputDraft.touched
		};
		runOps(setOps(state.inventory, [update]), t("modelSettingsSaved"), () => {
			setState((current) => ({
				...current,
				dirty: removeDirtyFields(current.dirty, key, [
					"levels",
					"context",
					"input"
				])
			}));
		});
	};
	const closeModelEditor = (item) => {
		const key = keyOf(item);
		setState((current) => {
			const expanded = { ...current.expanded };
			delete expanded[key];
			const drafts = { ...current.drafts };
			delete drafts[key];
			const contextDrafts = { ...current.contextDrafts };
			delete contextDrafts[key];
			const inputDrafts = { ...current.inputDrafts };
			delete inputDrafts[key];
			const dirty = { ...current.dirty };
			delete dirty[key];
			return {
				...current,
				expanded,
				drafts,
				contextDrafts,
				inputDrafts,
				dirty
			};
		});
	};
	const restoreReasoningDefaults = (item) => {
		const key = keyOf(item);
		runOps(setOps(state.inventory, [{
			item,
			levels: DEFAULT_LEVELS
		}]), t("restoreReasoning"), () => {
			setState((current) => ({
				...current,
				drafts: current.drafts[key] ? {
					...current.drafts,
					[key]: draftFrom(DEFAULT_LEVELS)
				} : current.drafts,
				dirty: removeDirtyFields(current.dirty, key, ["levels"])
			}));
		});
	};
	const restoreProviderDefaults = (item) => {
		runOps(setOps(state.inventory, [{
			item,
			contextWindow: void 0,
			contextWindowTouched: true,
			input: void 0,
			inputTouched: true
		}]), t("restoreCapability"), () => closeModelEditor(item));
	};
	const applyPreset = (levels) => {
		runOps(setOps(state.inventory, state.inventory.map((item) => ({
			item,
			levels
		}))), t("settingsUpdated"), () => {
			setState((current) => {
				let dirty = current.dirty;
				const drafts = { ...current.drafts };
				current.inventory.forEach((item) => {
					const key = keyOf(item);
					if (drafts[key]) drafts[key] = draftFrom(levels);
					dirty = removeDirtyFields(dirty, key, ["levels"]);
				});
				return {
					...current,
					drafts,
					dirty
				};
			});
		});
	};
	const applySubagentEffort = () => {
		const value = state.subagentDraft === "default" ? void 0 : state.subagentDraft === "custom" ? state.subagentCustom.trim() : state.subagentDraft;
		if (state.subagentDraft !== "default" && !value) {
			setState((current) => ({
				...current,
				notice: null,
				error: t("customEffortRequired")
			}));
			return;
		}
		const ops = state.subagentDraft === "default" ? [{
			op: "unset",
			path: ["subagentEffort"]
		}] : [{
			op: "set",
			path: ["subagentEffort"],
			value
		}];
		runOps(ops, t("subagentSaved"));
	};
	const toggleProvider = (route) => setState((current) => ({
		...current,
		expandedProviders: {
			...current.expandedProviders,
			[route]: current.expandedProviders[route] !== true
		}
	}));
	const toggleExpand = (item) => {
		const key = keyOf(item);
		setState((current) => {
			if (current.expanded[key]) {
				const expanded = { ...current.expanded };
				delete expanded[key];
				return {
					...current,
					expanded
				};
			}
			return {
				...current,
				expanded: {
					...current.expanded,
					[key]: true
				},
				drafts: current.drafts[key] ? current.drafts : {
					...current.drafts,
					[key]: draftFrom(item.levels)
				},
				contextDrafts: current.contextDrafts[key] ? current.contextDrafts : {
					...current.contextDrafts,
					[key]: contextDraftFrom(item)
				},
				inputDrafts: current.inputDrafts[key] ? current.inputDrafts : {
					...current.inputDrafts,
					[key]: inputDraftFrom(item)
				}
			};
		});
	};
	const patchDraft = (item, level, patch) => {
		const key = keyOf(item);
		setState((current) => {
			const cell = {
				...current.drafts[key]?.[level] ?? {
					on: false,
					wire: ""
				},
				...patch
			};
			if (level !== "off" && patch.on === true && cell.wire.trim() === "") cell.wire = level;
			return {
				...current,
				notice: null,
				dirty: {
					...current.dirty,
					[key]: {
						...current.dirty[key],
						levels: true
					}
				},
				drafts: {
					...current.drafts,
					[key]: {
						...current.drafts[key],
						[level]: cell
					}
				}
			};
		});
	};
	const patchContextValue = (item, value) => {
		const key = keyOf(item);
		setState((current) => {
			const draft = current.contextDrafts[key] ?? contextDraftFrom(item);
			return {
				...current,
				notice: null,
				dirty: {
					...current.dirty,
					[key]: {
						...current.dirty[key],
						context: true
					}
				},
				contextDrafts: {
					...current.contextDrafts,
					[key]: {
						...draft,
						value,
						previousValue: value,
						oneMillion: false,
						touched: true
					}
				}
			};
		});
	};
	const setOneMillion = (item, enabled) => {
		const key = keyOf(item);
		setState((current) => {
			const draft = current.contextDrafts[key] ?? contextDraftFrom(item);
			const previous = enabled ? draft.oneMillion ? draft.previousValue : draft.value : draft.previousValue;
			return {
				...current,
				notice: null,
				dirty: {
					...current.dirty,
					[key]: {
						...current.dirty[key],
						context: true
					}
				},
				contextDrafts: {
					...current.contextDrafts,
					[key]: {
						...draft,
						oneMillion: enabled,
						previousValue: previous || "",
						value: enabled ? String(CONTEXT_1M) : previous || "",
						touched: true
					}
				}
			};
		});
	};
	const patchInputCapability = (item, modality, enabled) => {
		const key = keyOf(item);
		setState((current) => {
			const draft = current.inputDrafts[key] ?? inputDraftFrom(item);
			if (!enabled && !draft[modality === "text" ? "image" : "text"]) return {
				...current,
				notice: null,
				error: t("inputCapabilityMinimum")
			};
			return {
				...current,
				error: null,
				notice: null,
				dirty: {
					...current.dirty,
					[key]: {
						...current.dirty[key],
						input: true
					}
				},
				inputDrafts: {
					...current.inputDrafts,
					[key]: {
						...draft,
						[modality]: enabled,
						touched: true
					}
				}
			};
		});
	};
	const query = state.query.trim().toLowerCase();
	const visible = query === "" ? state.inventory : state.inventory.filter((item) => item.model.toLowerCase().includes(query) || item.name.toLowerCase().includes(query));
	const routes = [...new Set(visible.map((item) => item.route))];
	const expandedCount = visible.filter((item) => state.expanded[keyOf(item)] && (query !== "" || state.expandedProviders[item.route])).length;
	const snapshot = locale.getSnapshot?.() ?? {};
	const available = new Set(snapshot.locales?.map((entry) => entry.id).filter((id) => typeof id === "string") ?? [
		"zh",
		"en",
		"ja",
		"ko"
	]);
	return (0, react_jsx_runtime.jsxs)("div", {
		style: {
			position: "relative",
			maxWidth: "920px",
			margin: "0 auto",
			padding: "6px 8px 34px",
			color: palette.text,
			fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif"
		},
		children: [
			(0, react_jsx_runtime.jsxs)("label", {
				style: {
					display: "flex",
					alignItems: "center",
					justifyContent: "flex-end",
					gap: "6px",
					fontSize: "12px",
					marginBottom: "4px"
				},
				children: [t("languageLabel"), (0, react_jsx_runtime.jsx)("select", {
					value: snapshot.active,
					onChange: (event) => locale.setLocale?.(event.currentTarget.value),
					style: {
						height: "26px",
						padding: "0 7px",
						border: `1px solid ${palette.border}`,
						borderRadius: "7px",
						backgroundColor: palette.field,
						color: palette.text,
						fontSize: "12px"
					},
					children: [
						["zh", "languageChinese"],
						["en", "languageEnglish"],
						["ja", "languageJapanese"],
						["ko", "languageKorean"]
					].map(([id, key]) => available.has(id) ? (0, react_jsx_runtime.jsx)("option", {
						value: id,
						children: t(key)
					}, id) : null)
				})]
			}),
			(0, react_jsx_runtime.jsxs)("h3", {
				style: {
					display: "flex",
					alignItems: "center",
					flexWrap: "wrap",
					columnGap: "8px",
					rowGap: "4px",
					fontSize: "18px",
					lineHeight: "24px",
					fontWeight: 700,
					letterSpacing: 0,
					margin: "0 0 7px"
				},
				children: [
					(0, react_jsx_runtime.jsx)(Icon, {
						name: "sliders",
						size: 19
					}),
					(0, react_jsx_runtime.jsx)("span", { children: t("pageTitle") }),
					state.notice ? (0, react_jsx_runtime.jsxs)("span", {
						role: "status",
						"aria-live": "polite",
						style: {
							display: "inline-flex",
							alignItems: "center",
							gap: "4px",
							marginLeft: "auto",
							padding: "2px 6px",
							border: `1px solid ${palette.accentBorder}`,
							borderRadius: "6px",
							color: palette.accent,
							backgroundColor: palette.accentSoft,
							fontSize: "11px",
							lineHeight: "16px",
							fontWeight: 650
						},
						children: [(0, react_jsx_runtime.jsx)(Icon, {
							name: "check",
							size: 12
						}), state.notice]
					}) : null
				]
			}),
			state.error ? (0, react_jsx_runtime.jsx)("div", {
				role: "alert",
				"aria-live": "assertive",
				style: {
					fontSize: "12px",
					lineHeight: "18px",
					color: palette.danger,
					backgroundColor: palette.dangerBg,
					border: `1px solid ${palette.dangerBorder}`,
					borderRadius: "8px",
					padding: "6px 8px",
					margin: "0 0 8px"
				},
				children: state.error
			}) : null,
			(0, react_jsx_runtime.jsx)(SubagentSettings, {
				effort: state.subagent?.effort ?? null,
				namespaceFound: state.subagent !== null,
				draft: state.subagentDraft,
				custom: state.subagentCustom,
				busy: state.busy,
				palette,
				t,
				onDraftChange: (value) => setState((current) => ({
					...current,
					notice: null,
					subagentDraft: value
				})),
				onCustomChange: (value) => setState((current) => ({
					...current,
					notice: null,
					subagentCustom: value
				})),
				onSave: applySubagentEffort
			}),
			state.nsFound === false ? (0, react_jsx_runtime.jsx)("p", {
				style: {
					fontSize: "12px",
					opacity: .75
				},
				children: t("noNamespace")
			}) : (0, react_jsx_runtime.jsxs)("div", { children: [
				(0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						alignItems: "center",
						gap: "8px",
						flexWrap: "wrap",
						marginBottom: state.quickSettingsOpen ? "4px" : "6px"
					},
					children: [(0, react_jsx_runtime.jsx)(ActionButton, {
						text: t("quickSettings"),
						onClick: () => setState((current) => ({
							...current,
							quickSettingsOpen: !current.quickSettingsOpen
						})),
						disabled: state.busy,
						palette,
						icon: state.quickSettingsOpen ? "chevronUp" : "sliders"
					}), state.quickSettingsOpen ? (0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "flex",
							gap: "6px",
							flexWrap: "wrap",
							flexBasis: "100%",
							padding: "4px",
							border: `1px solid ${palette.border}`,
							borderRadius: "8px",
							backgroundColor: palette.field
						},
						children: PRESETS.map((preset) => (0, react_jsx_runtime.jsx)(ActionButton, {
							text: t(preset.labelKey),
							onClick: () => {
								setState((current) => ({
									...current,
									quickSettingsOpen: false
								}));
								applyPreset(preset.levels);
							},
							disabled: state.busy,
							palette,
							icon: preset.key === "official" ? "sparkles" : "sliders"
						}, preset.key))
					}) : null]
				}),
				(0, react_jsx_runtime.jsxs)("div", {
					style: {
						position: "relative",
						marginBottom: "7px"
					},
					children: [(0, react_jsx_runtime.jsx)("span", {
						style: {
							position: "absolute",
							left: "10px",
							top: "50%",
							transform: "translateY(-50%)",
							color: palette.secondary,
							pointerEvents: "none"
						},
						children: (0, react_jsx_runtime.jsx)(Icon, {
							name: "search",
							size: 15
						})
					}), (0, react_jsx_runtime.jsx)("input", {
						type: "text",
						value: state.query,
						placeholder: t("searchPlaceholder"),
						onChange: (event) => {
							const value = event.currentTarget.value;
							setState((current) => ({
								...current,
								query: value
							}));
						},
						style: {
							boxSizing: "border-box",
							width: "100%",
							height: "30px",
							padding: "0 10px 0 30px",
							border: `1px solid ${palette.border}`,
							borderRadius: "8px",
							fontSize: "13px",
							backgroundColor: palette.field,
							color: palette.text,
							outline: "none",
							boxShadow: palette.shadow
						}
					})]
				}),
				state.loading ? (0, react_jsx_runtime.jsx)("div", {
					style: {
						fontSize: "12px",
						opacity: .7
					},
					children: t("loading")
				}) : visible.length === 0 ? (0, react_jsx_runtime.jsx)("div", {
					style: {
						fontSize: "12px",
						opacity: .7
					},
					children: state.inventory.length === 0 ? t("noModels") : t("noMatches")
				}) : routes.map((route) => {
					const providerModels = visible.filter((item) => item.route === route);
					const providerOpen = query !== "" || state.expandedProviders[route] === true;
					return (0, react_jsx_runtime.jsxs)("div", {
						style: { marginBottom: "6px" },
						children: [(0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "grid",
								gridTemplateColumns: "minmax(0, 1fr) auto",
								alignItems: "center",
								columnGap: "8px",
								minHeight: "32px",
								padding: "4px 6px",
								marginBottom: "4px",
								border: `1px solid ${palette.border}`,
								borderRadius: "8px",
								backgroundColor: palette.raised
							},
							children: [(0, react_jsx_runtime.jsxs)("span", {
								style: {
									display: "flex",
									alignItems: "center",
									gap: "7px",
									minWidth: 0
								},
								children: [(0, react_jsx_runtime.jsx)("span", {
									style: {
										display: "inline-flex",
										alignItems: "center",
										justifyContent: "center",
										width: "22px",
										height: "22px",
										minWidth: "22px",
										border: `1px solid ${palette.border}`,
										borderRadius: "7px",
										color: palette.secondary,
										backgroundColor: palette.group
									},
									children: (0, react_jsx_runtime.jsx)(Icon, {
										name: "layers",
										size: 14
									})
								}), (0, react_jsx_runtime.jsxs)("span", {
									style: {
										display: "grid",
										gap: "1px",
										minWidth: 0
									},
									children: [(0, react_jsx_runtime.jsx)("span", {
										style: {
											color: palette.text,
											fontSize: "12px",
											fontWeight: 700,
											overflowWrap: "anywhere"
										},
										children: route
									}), (0, react_jsx_runtime.jsx)("span", {
										style: {
											color: palette.accent,
											fontSize: "10px",
											lineHeight: "11px",
											fontWeight: 700
										},
										children: t("vendor")
									})]
								})]
							}), (0, react_jsx_runtime.jsxs)("span", {
								style: {
									display: "flex",
									alignItems: "center",
									gap: "6px",
									fontSize: "11px",
									color: palette.secondary,
									whiteSpace: "nowrap"
								},
								children: [(0, react_jsx_runtime.jsx)("span", { children: t("modelCount", { count: providerModels.length }) }), query !== "" ? (0, react_jsx_runtime.jsx)("span", { children: t("searchResults") }) : (0, react_jsx_runtime.jsx)(ActionButton, {
									text: "",
									onClick: () => toggleProvider(route),
									palette,
									tone: "ghost",
									icon: providerOpen ? "chevronUp" : "chevronDown",
									label: providerOpen ? t("collapseProvider") : t("expandProvider")
								})]
							})]
						}), providerOpen ? providerModels.map((item) => {
							const key = keyOf(item);
							const dirty = state.dirty[key] ?? {};
							return (0, react_jsx_runtime.jsx)(ModelRow, {
								item,
								open: state.expanded[key] === true,
								draft: state.drafts[key],
								contextDraft: state.contextDrafts[key] ?? contextDraftFrom(item),
								inputDraft: state.inputDrafts[key] ?? inputDraftFrom(item),
								dirty: dirty.levels === true || dirty.context === true || dirty.input === true,
								busy: state.busy,
								palette,
								t,
								onToggle: () => toggleExpand(item),
								onLevelChange: (level, patch) => patchDraft(item, level, patch),
								onContextChange: (value) => patchContextValue(item, value),
								onOneMillionChange: (enabled) => setOneMillion(item, enabled),
								onInputChange: (modality, enabled) => patchInputCapability(item, modality, enabled),
								onSave: () => applyModel(item),
								onRestoreReasoning: () => restoreReasoningDefaults(item),
								onRestoreCapability: () => restoreProviderDefaults(item)
							}, `${key}-${item.inOverrides ? "override" : item.index}`);
						}) : null]
					}, route);
				}),
				expandedCount > 0 ? (0, react_jsx_runtime.jsx)("div", {
					style: {
						fontSize: "12px",
						color: palette.secondary,
						margin: "4px 2px 0"
					},
					children: t("expandedSettings", { count: expandedCount })
				}) : null
			] }),
			(0, react_jsx_runtime.jsxs)("span", {
				"aria-label": t("versionLabel"),
				style: {
					position: "absolute",
					right: "12px",
					bottom: "8px",
					fontSize: "10px",
					lineHeight: "14px",
					opacity: .45,
					pointerEvents: "none",
					userSelect: "none"
				},
				children: ["v", PLUGIN_VERSION]
			})
		]
	});
}
//#endregion
//#region lib/types/client/index.js
const name = "@hytime/dsh-thinking-effort";
const inject = [
	"slots",
	"connection",
	"locale"
];
const SLOT_NAME = "settings.section";
const SLOT_ID = "thinking-effort";
const SLOT_ORDER = 12;
function hasLanguage(locale, id) {
	const snapshot = locale.getSnapshot?.();
	return Array.isArray(snapshot?.locales) && snapshot.locales.some((entry) => entry?.id === id);
}
function apply(context) {
	const slots = context.get("slots");
	if (slots === void 0) return;
	const connection = context.get("connection");
	const locale = context.get("locale");
	let mounted = false;
	const mount = (settings) => {
		if (mounted || settings === void 0) return;
		mounted = true;
		const translate = locale.bind(LOCALE_NS);
		context.effect(() => {
			const languageDisposers = [];
			const disposeDictionaries = locale.register(LOCALE_NS, LOCALE_DATA);
			const canRegisterExternalLanguages = settings.externalLanguages && typeof locale.addLanguage === "function";
			try {
				if (canRegisterExternalLanguages && !hasLanguage(locale, "ja")) languageDisposers.push(locale.addLanguage({
					id: "ja",
					label: translate("languageJapanese"),
					fallback: "en"
				}));
				if (canRegisterExternalLanguages && !hasLanguage(locale, "ko")) languageDisposers.push(locale.addLanguage({
					id: "ko",
					label: translate("languageKorean"),
					fallback: "en"
				}));
			} catch (error) {
				for (const dispose of languageDisposers.reverse()) dispose();
				disposeDictionaries();
				throw error;
			}
			return () => {
				for (const dispose of languageDisposers.reverse()) dispose();
				disposeDictionaries();
			};
		}, "dsh-thinking-effort: language pack dictionaries");
		slots.inject(SLOT_NAME, () => slots.register({
			name: SLOT_NAME,
			id: SLOT_ID,
			order: SLOT_ORDER,
			locale: LOCALE_NS,
			label: () => translate("pageTitle")
		}, () => (0, react.createElement)(SectionEditor, {
			settings,
			locale,
			t: translate
		})));
	};
	const mountFromRemote = () => {
		mount(settingsBridge(connection, context.get("remote.settings"), locale.addLanguage));
	};
	mountFromRemote();
	context.on("internal/service", (serviceName) => {
		if (serviceName === "remote.settings" || serviceName === "remote") mountFromRemote();
	});
}
//#endregion
exports.apply = apply;
exports.inject = inject;
exports.name = name;

module.exports = exports; return module.exports; } });