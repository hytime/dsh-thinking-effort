/**
 * dsh-thinking-effort-client — 浏览器半区 bundle。
 *
 * 注册“设置 → 思考强度档位”页面：按路由列出 pi-ai 手工声明模型，
 * 逐模型自定义思考档位（勾选档位 + 自由填写发送给网关的线上值）。
 * 数据经标准 API client（connection.api.settings）读写，无需自定义 remote。
 *
 * 本文件即产物 bundle：CJS 工厂经 window.__ModuleLoader__.load 注册，
 * 与 tsdown 生成的 client bundle 格式一致（手写、内联样式、零构建）。
 */
window.__ModuleLoader__.load({
  id: '@hytime/dsh-thinking-effort',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const React = require('react');

    const ALL_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
    const PRESETS = [
      { key: 'official', levels: { off: null, high: 'high', max: 'max' }, labelKey: 'presetOfficial' },
      { key: 'generic', levels: { off: null, low: 'low', medium: 'medium', high: 'high' }, labelKey: 'presetGeneric' },
    ];
    const NS = 'llm-pi-ai';
    const LOCALE_NS = 'settings.thinkingEffort';
    const PLUGIN_VERSION = '0.1.7';
    const DEFAULT_LEVELS = { off: null, high: 'high', max: 'max' };
    const LEVEL_LABEL_KEYS = {
      off: 'levelOff', minimal: 'levelMinimal', low: 'levelLow', medium: 'levelMedium',
      high: 'levelHigh', xhigh: 'levelXhigh', max: 'levelMax',
    };
    /* BEGIN GENERATED LOCALE DATA */
    const LOCALE_DATA = {"zh":{"title":"第三方模型思考强度档位","description":"勾选档位后，右侧输入框可自由定义发送给网关的线上值。例如给 high 填 ultra，Composer 选中 High 时网关会收到 ultra。未设置档位的模型自动采用默认档位（Off / High / Max）。","subagentTitle":"子 agent 思考强度（Subagent 默认档位）","currentDefault":"当前默认：{effort}","unconfiguredSubagent":"未配置（子 agent 继承主 agent / 提供方默认）","providerDefault":"提供方默认","apply":"应用","presetOfficial":"应用到全部：Off / High / Max（官方 DeepSeek 风格）","presetGeneric":"应用到全部：Off / Low / Medium / High（通用）","searchPlaceholder":"搜索模型（名称或 ID）…","loading":"加载中…","noModels":"没有手工声明的 pi-ai 模型","noMatches":"没有匹配的模型","noDeclared":"未声明","route":"路由：{route}","customize":"自定义档位","collapse":"收起","editorTitle":"编辑档位（勾选后填写线上值，点击“应用此档位”保存）","applyLevel":"应用此档位","restoreDefault":"恢复默认档位","expandedCount":"已展开 {count} 个模型，可编辑档位","versionLabel":"插件版本","languageLabel":"页面语言","languageChinese":"中文","languageEnglish":"English","languageJapanese":"日本語","languageKorean":"한국어","customPlaceholder":"自定义档位，如 ultra","offPlaceholder":"留空 = 不发送","wirePlaceholder":"自定义线上值，如 ultra","noNamespace":"未找到 llm-pi-ai 设置命名空间（无第三方模型配置）。","customEffortRequired":"请输入自定义思考档位","levelNeedsValue":"档位 {level} 需要填写线上值","atLeastThinking":"至少需要一个思考档位","readSettingsFailed":"读取设置失败：{message}","writeFailed":"写入失败，请重试","writeError":"写入失败：{message}","levelOff":"off","levelMinimal":"minimal","levelLow":"low","levelMedium":"medium","levelHigh":"high","levelXhigh":"xhigh","levelMax":"max","levelSuffix":" 档位","pageTitle":"模型能力与档位","subagentCardTitle":"子 agent 默认档位","inputCapabilityMinimum":"至少启用一种输入能力","contextInteger":"上下文长度必须是整数（2000-1000000）","contextRange":"上下文长度必须在 2000 到 1000000 之间","saveMissingNamespace":"保存成功但未返回最新设置","settingsUpdated":"设置已更新","modelSettingsSaved":"模型设置已保存","restoreReasoning":"已恢复默认思考档位","restoreCapability":"已恢复默认能力","officialPreset":"官方预设","genericPreset":"通用预设","subagentSaved":"子 agent 默认档位已保存","quickSettings":"一键设置","vendor":"供应商","modelCount":"{count} 个模型","searchResults":"搜索结果","model":"模型","unsaved":"未保存","textEnabled":"文字输入：已启用","textDisabled":"文字输入：未启用","imageEnabled":"图像输入：已启用","imageDisabled":"图像输入：未启用","openModelSettings":"打开模型设置","closeModelSettings":"收起模型设置","contextLength":"上下文长度","oneMillionMode":"1M 模式","inputCapabilities":"输入能力","textInput":"文字输入","imageInput":"图像输入","reasoningLevels":"思考档位","saveChanges":"保存更改","saved":"已保存","saveModelChanges":"保存模型更改","noPendingChanges":"没有待保存的更改","expandedSettings":"已展开 {count} 个模型，可编辑设置","collapseProvider":"收起供应商","expandProvider":"展开供应商","providerDefaultShort":"提供方默认","contextTitle":"上下文 {value}","contextLabel":"上下文 {label}"},"en":{"title":"Third-party model reasoning effort","description":"Select an effort and enter the exact value sent to the gateway. For example, set high to ultra to send ultra when High is selected in Composer. Models without a declaration use the default options (Off / High / Max).","subagentTitle":"Subagent reasoning effort","currentDefault":"Current default: {effort}","unconfiguredSubagent":"Not configured (subagents inherit the provider default)","providerDefault":"Provider default","apply":"Apply","presetOfficial":"Apply to all: Off / High / Max (official DeepSeek style)","presetGeneric":"Apply to all: Off / Low / Medium / High (generic)","searchPlaceholder":"Search models by name or ID…","loading":"Loading…","noModels":"No hand-declared pi-ai models","noMatches":"No matching models","noDeclared":"Not declared","route":"Route: {route}","customize":"Customize effort","collapse":"Collapse","editorTitle":"Edit effort (select a level, enter its wire value, then apply)","applyLevel":"Apply effort","restoreDefault":"Restore defaults","expandedCount":"{count} models expanded","versionLabel":"Plugin version","languageLabel":"Page language","languageChinese":"中文","languageEnglish":"English","languageJapanese":"日本語","languageKorean":"한국어","customPlaceholder":"Custom effort, e.g. ultra","offPlaceholder":"Empty = do not send","wirePlaceholder":"Custom wire value, e.g. ultra","noNamespace":"llm-pi-ai settings were not found (no third-party model configuration).","customEffortRequired":"Enter a custom reasoning effort","levelNeedsValue":"Effort {level} needs a wire value","atLeastThinking":"Select at least one reasoning effort","readSettingsFailed":"Failed to read settings: {message}","writeFailed":"Write failed. Please try again.","writeError":"Write failed: {message}","levelOff":"off","levelMinimal":"minimal","levelLow":"low","levelMedium":"medium","levelHigh":"high","levelXhigh":"xhigh","levelMax":"max","levelSuffix":" effort","pageTitle":"Model capabilities and effort","subagentCardTitle":"Subagent default effort","inputCapabilityMinimum":"Enable at least one input capability","contextInteger":"Context length must be an integer (2000-1000000)","contextRange":"Context length must be between 2000 and 1000000","saveMissingNamespace":"Saved, but the latest settings were not returned","settingsUpdated":"Settings updated","modelSettingsSaved":"Model settings saved","restoreReasoning":"Default reasoning effort restored","restoreCapability":"Default capabilities restored","officialPreset":"official preset","genericPreset":"generic preset","subagentSaved":"Subagent default effort saved","quickSettings":"Quick settings","vendor":"Provider","modelCount":"{count} models","searchResults":"Search results","model":"Model","unsaved":"Unsaved","textEnabled":"Text input: enabled","textDisabled":"Text input: disabled","imageEnabled":"Image input: enabled","imageDisabled":"Image input: disabled","openModelSettings":"Open model settings","closeModelSettings":"Collapse model settings","contextLength":"Context length","oneMillionMode":"1M mode","inputCapabilities":"Input capabilities","textInput":"Text input","imageInput":"Image input","reasoningLevels":"Reasoning effort","saveChanges":"Save changes","saved":"Saved","saveModelChanges":"Save model changes","noPendingChanges":"No pending changes","expandedSettings":"{count} models expanded","collapseProvider":"Collapse provider","expandProvider":"Expand provider","providerDefaultShort":"Provider default","contextTitle":"Context {value}","contextLabel":"Context {label}"},"ja":{"title":"サードパーティモデルの推論強度","description":"推論強度を選択し、ゲートウェイに送信する値を入力します。たとえば high に ultra を設定すると、Composer で High を選択したときに ultra が送信されます。未設定のモデルには既定の選択肢（Off / High / Max）が使用されます。","subagentTitle":"Subagent の推論強度","currentDefault":"現在の既定値：{effort}","unconfiguredSubagent":"未設定（Subagent はプロバイダーの既定値を継承）","providerDefault":"プロバイダーの既定値","apply":"適用","presetOfficial":"すべてに適用：Off / High / Max（公式 DeepSeek 形式）","presetGeneric":"すべてに適用：Off / Low / Medium / High（汎用）","searchPlaceholder":"モデル名または ID で検索…","loading":"読み込み中…","noModels":"手動で宣言された pi-ai モデルはありません","noMatches":"一致するモデルはありません","noDeclared":"未宣言","route":"ルート：{route}","customize":"推論強度をカスタマイズ","collapse":"折りたたむ","editorTitle":"推論強度を編集（レベルを選択し、送信値を入力して適用）","applyLevel":"推論強度を適用","restoreDefault":"既定値に戻す","expandedCount":"{count} 個のモデルを展開中","versionLabel":"プラグインバージョン","languageLabel":"ページの言語","languageChinese":"中文","languageEnglish":"English","languageJapanese":"日本語","languageKorean":"한국어","customPlaceholder":"カスタム推論強度（例：ultra）","offPlaceholder":"空欄 = 送信しない","wirePlaceholder":"カスタム送信値（例：ultra）","noNamespace":"llm-pi-ai の設定名前空間が見つかりません（サードパーティモデルの設定がありません）。","customEffortRequired":"カスタム推論強度を入力してください","levelNeedsValue":"推論強度 {level} には送信値が必要です","atLeastThinking":"少なくとも 1 つの推論強度を選択してください","readSettingsFailed":"設定の読み込みに失敗しました：{message}","writeFailed":"書き込みに失敗しました。もう一度お試しください。","writeError":"書き込みに失敗しました：{message}","levelOff":"off","levelMinimal":"minimal","levelLow":"low","levelMedium":"medium","levelHigh":"high","levelXhigh":"xhigh","levelMax":"max","levelSuffix":" の推論強度","pageTitle":"モデルの能力と推論強度","subagentCardTitle":"Subagent の既定の推論強度","inputCapabilityMinimum":"少なくとも 1 つの入力能力を有効にしてください","contextInteger":"コンテキスト長は整数で入力してください（2000-1000000）","contextRange":"コンテキスト長は 2000 から 1000000 の範囲で指定してください","saveMissingNamespace":"保存しましたが、最新の設定が返されませんでした","settingsUpdated":"設定を更新しました","modelSettingsSaved":"モデル設定を保存しました","restoreReasoning":"既定の推論強度に戻しました","restoreCapability":"既定の能力に戻しました","officialPreset":"公式プリセット","genericPreset":"汎用プリセット","subagentSaved":"Subagent の既定の推論強度を保存しました","quickSettings":"クイック設定","vendor":"プロバイダー","modelCount":"{count} 個のモデル","searchResults":"検索結果","model":"モデル","unsaved":"未保存","textEnabled":"テキスト入力：有効","textDisabled":"テキスト入力：無効","imageEnabled":"画像入力：有効","imageDisabled":"画像入力：無効","openModelSettings":"モデル設定を開く","closeModelSettings":"モデル設定を折りたたむ","contextLength":"コンテキスト長","oneMillionMode":"1M モード","inputCapabilities":"入力能力","textInput":"テキスト入力","imageInput":"画像入力","reasoningLevels":"推論強度","saveChanges":"変更を保存","saved":"保存済み","saveModelChanges":"モデルの変更を保存","noPendingChanges":"保存する変更はありません","expandedSettings":"{count} 個のモデル設定を展開中","collapseProvider":"プロバイダーを折りたたむ","expandProvider":"プロバイダーを展開","providerDefaultShort":"プロバイダーの既定値","contextTitle":"コンテキスト {value}","contextLabel":"コンテキスト {label}"},"ko":{"title":"타사 모델 추론 강도","description":"추론 강도를 선택하고 게이트웨이에 보낼 값을 입력합니다. 예를 들어 high에 ultra를 설정하면 Composer에서 High를 선택할 때 ultra가 전송됩니다. 설정이 없는 모델은 기본 선택 항목(Off / High / Max)을 사용합니다.","subagentTitle":"Subagent 추론 강도","currentDefault":"현재 기본값: {effort}","unconfiguredSubagent":"설정되지 않음 (Subagent가 제공자 기본값을 상속)","providerDefault":"제공자 기본값","apply":"적용","presetOfficial":"전체에 적용: Off / High / Max (공식 DeepSeek 방식)","presetGeneric":"전체에 적용: Off / Low / Medium / High (일반 방식)","searchPlaceholder":"모델 이름 또는 ID로 검색…","loading":"로드 중…","noModels":"수동으로 선언된 pi-ai 모델이 없습니다","noMatches":"일치하는 모델이 없습니다","noDeclared":"선언되지 않음","route":"라우트: {route}","customize":"추론 강도 사용자 지정","collapse":"접기","editorTitle":"추론 강도 편집 (단계를 선택하고 전송 값을 입력한 후 적용)","applyLevel":"추론 강도 적용","restoreDefault":"기본값 복원","expandedCount":"모델 {count}개 펼침","versionLabel":"플러그인 버전","languageLabel":"페이지 언어","languageChinese":"中文","languageEnglish":"English","languageJapanese":"日本語","languageKorean":"한국어","customPlaceholder":"사용자 지정 추론 강도 (예: ultra)","offPlaceholder":"비워 둠 = 전송하지 않음","wirePlaceholder":"사용자 지정 전송 값 (예: ultra)","noNamespace":"llm-pi-ai 설정 네임스페이스를 찾을 수 없습니다 (타사 모델 설정이 없습니다).","customEffortRequired":"사용자 지정 추론 강도를 입력하세요","levelNeedsValue":"추론 강도 {level}에는 전송 값이 필요합니다","atLeastThinking":"추론 강도를 하나 이상 선택하세요","readSettingsFailed":"설정을 읽지 못했습니다: {message}","writeFailed":"쓰기에 실패했습니다. 다시 시도하세요.","writeError":"쓰기에 실패했습니다: {message}","levelOff":"off","levelMinimal":"minimal","levelLow":"low","levelMedium":"medium","levelHigh":"high","levelXhigh":"xhigh","levelMax":"max","levelSuffix":" 추론 강도","pageTitle":"모델 기능 및 추론 강도","subagentCardTitle":"Subagent 기본 추론 강도","inputCapabilityMinimum":"입력 기능을 하나 이상 활성화하세요","contextInteger":"컨텍스트 길이는 정수여야 합니다 (2000-1000000)","contextRange":"컨텍스트 길이는 2000에서 1000000 사이여야 합니다","saveMissingNamespace":"저장했지만 최신 설정을 받지 못했습니다","settingsUpdated":"설정이 업데이트되었습니다","modelSettingsSaved":"모델 설정이 저장되었습니다","restoreReasoning":"기본 추론 강도를 복원했습니다","restoreCapability":"기본 기능을 복원했습니다","officialPreset":"공식 프리셋","genericPreset":"일반 프리셋","subagentSaved":"Subagent 기본 추론 강도가 저장되었습니다","quickSettings":"빠른 설정","vendor":"제공자","modelCount":"모델 {count}개","searchResults":"검색 결과","model":"모델","unsaved":"저장되지 않음","textEnabled":"텍스트 입력: 활성화됨","textDisabled":"텍스트 입력: 비활성화됨","imageEnabled":"이미지 입력: 활성화됨","imageDisabled":"이미지 입력: 비활성화됨","openModelSettings":"모델 설정 열기","closeModelSettings":"모델 설정 접기","contextLength":"컨텍스트 길이","oneMillionMode":"1M 모드","inputCapabilities":"입력 기능","textInput":"텍스트 입력","imageInput":"이미지 입력","reasoningLevels":"추론 강도","saveChanges":"변경 사항 저장","saved":"저장됨","saveModelChanges":"모델 변경 사항 저장","noPendingChanges":"저장할 변경 사항이 없습니다","expandedSettings":"모델 설정 {count}개 펼침","collapseProvider":"제공자 접기","expandProvider":"제공자 펼치기","providerDefaultShort":"제공자 기본값","contextTitle":"컨텍스트 {value}","contextLabel":"컨텍스트 {label}"}};
    const { zh, en, ja, ko } = LOCALE_DATA;
    /* END GENERATED LOCALE DATA */
    const CONTEXT_MIN = 2000;
    const CONTEXT_1M = 1000000;
    const CONTEXT_MAX = CONTEXT_1M;
    const INPUT_MODALITIES = ['text', 'image'];

    function svgIcon(name, size) {
      const children = [];
      if (name === 'sliders' || name === 'settings') {
        children.push(
          React.createElement('path', { key: 'lines', d: 'M4 6h16M4 12h16M4 18h16' }),
          React.createElement('circle', { key: 'a', cx: '8', cy: '6', r: '2' }),
          React.createElement('circle', { key: 'b', cx: '15', cy: '12', r: '2' }),
          React.createElement('circle', { key: 'c', cx: '10', cy: '18', r: '2' }),
        );
      } else if (name === 'chevronDown') {
        children.push(React.createElement('path', { key: 'path', d: 'm6 9 6 6 6-6' }));
      } else if (name === 'chevronUp') {
        children.push(React.createElement('path', { key: 'path', d: 'm18 15-6-6-6 6' }));
      } else if (name === 'check') {
        children.push(React.createElement('path', { key: 'path', d: 'm5 12 4 4L19 6' }));
      } else if (name === 'restore') {
        children.push(
          React.createElement('path', { key: 'arrow', d: 'M9 7H5v4' }),
          React.createElement('path', { key: 'curve', d: 'M5 11a7 7 0 1 1 2 6' }),
        );
      } else if (name === 'search') {
        children.push(
          React.createElement('circle', { key: 'circle', cx: '11', cy: '11', r: '6.5' }),
          React.createElement('path', { key: 'handle', d: 'm16 16 4 4' }),
        );
      } else if (name === 'layers') {
        children.push(
          React.createElement('path', { key: 'top', d: 'm12 3 8 4-8 4-8-4 8-4Z' }),
          React.createElement('path', { key: 'middle', d: 'm4 12 8 4 8-4' }),
          React.createElement('path', { key: 'bottom', d: 'm4 17 8 4 8-4' }),
        );
      } else if (name === 'text') {
        children.push(React.createElement('path', { key: 'path', d: 'M5 5h14M12 5v14M8 19h8' }));
      } else if (name === 'image') {
        children.push(
          React.createElement('rect', { key: 'rect', x: '3', y: '4', width: '18', height: '16', rx: '2' }),
          React.createElement('circle', { key: 'circle', cx: '8.5', cy: '9', r: '1.5' }),
          React.createElement('path', { key: 'mountain', d: 'm4 17 5-5 3 3 2-2 6 4' }),
        );
      } else if (name === 'model') {
        children.push(
          React.createElement('path', { key: 'box', d: 'm12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z' }),
          React.createElement('path', { key: 'top', d: 'm4 7.5 8 4.5 8-4.5' }),
          React.createElement('path', { key: 'side', d: 'M12 12v9' }),
        );
      } else if (name === 'context') {
        children.push(
          React.createElement('path', { key: 'brackets', d: 'M8 4H5v16h3M16 4h3v16h-3' }),
          React.createElement('path', { key: 'lines', d: 'M10 8h4M10 12h4M10 16h4' }),
        );
      } else if (name === 'sparkles') {
        children.push(
          React.createElement('path', { key: 'large', d: 'm12 3-1.2 4.8L6 9l4.8 1.2L12 15l1.2-4.8L18 9l-4.8-1.2L12 3Z' }),
          React.createElement('path', { key: 'small', d: 'm19 14-.7 2.3L16 17l2.3.7L19 20l.7-2.3L22 17l-2.3-.7L19 14Z' }),
        );
      }
      return React.createElement('svg', {
        width: size || 15, height: size || 15, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': true, focusable: false, style: { display: 'block', flex: '0 0 auto' },
      }, children);
    }

    function iosPalette() {
      let dark = true;
      try {
        const source = window.getComputedStyle(document.body).backgroundColor;
        const values = String(source).match(/\d+(?:\.\d+)?/g);
        const alpha = values && values.length > 3 ? Number(values[3]) : 1;
        if (values && values.length >= 3 && alpha > 0) {
          const rgb = values.slice(0, 3).map(Number);
          dark = (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722) < 145;
        } else if (window.matchMedia) {
          dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
      } catch (_) {}
      return dark
        ? {
            canvas: '#1C1C1E', group: '#2C2C2E', raised: '#3A3A3C', field: '#2C2C2E',
            border: 'rgba(255,255,255,0.12)', divider: 'rgba(255,255,255,0.10)',
            text: '#F5F5F7', secondary: 'rgba(235,235,245,0.60)', accent: '#0A84FF', accentSoft: 'rgba(10,132,255,0.16)', accentBorder: 'rgba(10,132,255,0.42)',
            switchOff: '#39393D', danger: '#FF453A', dangerBg: 'rgba(255,69,58,0.16)',
            dangerBorder: 'rgba(255,69,58,0.30)', shadow: '0 1px 1px rgba(0,0,0,0.24)',
          }
        : {
            canvas: '#F2F2F7', group: '#FFFFFF', raised: '#F9F9FB', field: '#F2F2F7',
            border: 'rgba(60,60,67,0.18)', divider: 'rgba(60,60,67,0.18)',
            text: '#1C1C1E', secondary: '#6D6D72', accent: '#007AFF', accentSoft: 'rgba(0,122,255,0.10)', accentBorder: 'rgba(0,122,255,0.32)',
            switchOff: '#E5E5EA', danger: '#FF3B30', dangerBg: 'rgba(255,59,48,0.12)',
            dangerBorder: 'rgba(255,59,48,0.28)', shadow: '0 1px 1px rgba(0,0,0,0.05)',
          };
    }

    function btn(text, onClick, disabled, tone, palette, iconName, label) {
      const theme = palette || iosPalette();
      const kind = tone || 'secondary';
      const iconOnly = text === '';
      const visual = kind === 'primary'
        ? { background: theme.accent, color: '#FFFFFF', border: theme.accent }
        : kind === 'danger'
          ? { background: theme.dangerBg, color: theme.danger, border: theme.dangerBorder }
          : kind === 'ghost'
            ? { background: 'transparent', color: theme.accent, border: 'transparent' }
            : { background: theme.field, color: theme.text, border: theme.border };
      const content = [];
      if (iconName) content.push(svgIcon(iconName, 14));
      if (text) content.push(React.createElement('span', null, text));
      return React.createElement('button', {
        type: 'button', title: label || undefined, 'aria-label': label || undefined,
        disabled: disabled === true,
        onClick,
        style: {
          height: '28px', minWidth: '28px', width: iconOnly ? '28px' : undefined, padding: iconOnly ? 0 : '0 9px', borderRadius: '8px',
          border: '1px solid ' + visual.border, backgroundColor: visual.background, color: visual.color,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
          fontSize: '12px', fontWeight: 600, letterSpacing: 0, whiteSpace: 'nowrap',
          cursor: disabled === true ? 'default' : 'pointer', opacity: disabled === true ? 0.5 : 1,
          boxShadow: kind === 'primary' ? theme.shadow : 'none',
          transition: 'background-color 150ms ease, opacity 150ms ease, transform 150ms ease',
        },
      }, ...content);
    }

    function iosSwitch(checked, onChange, disabled, label, palette) {
      const theme = palette || iosPalette();
      const on = checked === true;
      return React.createElement('button', {
        type: 'button', role: 'switch', 'aria-checked': on, 'aria-label': label, title: label,
        disabled: disabled === true, onClick: () => onChange(!on),
        style: {
          width: '44px', height: '26px', minWidth: '44px', padding: 0, position: 'relative',
          border: '1px solid ' + (on ? theme.accent : theme.border), borderRadius: '13px',
          backgroundColor: on ? theme.accent : theme.switchOff, cursor: disabled === true ? 'default' : 'pointer',
          opacity: disabled === true ? 0.5 : 1, transition: 'background-color 160ms ease, border-color 160ms ease',
        },
      }, React.createElement('span', {
        style: {
          position: 'absolute', top: '2px', left: '2px', width: '20px', height: '20px', borderRadius: '10px',
          backgroundColor: '#FFFFFF', boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
          transform: on ? 'translateX(18px)' : 'translateX(0)', transition: 'transform 160ms ease',
        },
      }));
    }

    function draftFrom(levels) {
      const draft = {};
      for (const level of ALL_LEVELS) {
        const wire = levels && typeof levels === 'object' && levels[level] !== undefined
          ? (levels[level] === null ? '' : String(levels[level]))
          : '';
        draft[level] = { on: wire !== '' || (level === 'off' && levels && levels.off === null), wire };
      }
      return draft;
    }

    function buildLevels(draft) {
      const out = {};
      for (const level of ALL_LEVELS) {
        const cell = draft[level];
        if (!cell || !cell.on) continue;
        if (level === 'off') out[level] = cell.wire && cell.wire.trim() !== '' ? cell.wire.trim() : null;
        else out[level] = cell.wire.trim();
      }
      return out;
    }

    function contextDraftFrom(item) {
      const contextWindow = item && Number.isInteger(item.contextWindow) ? item.contextWindow : undefined;
      const value = contextWindow === undefined ? '' : String(contextWindow);
      return {
        value,
        oneMillion: contextWindow === CONTEXT_1M,
        previousValue: contextWindow === CONTEXT_1M ? '' : value,
        touched: false,
      };
    }

    function inputDraftFrom(item) {
      const declared = item && Array.isArray(item.input) ? item.input : [];
      const effective = declared.length > 0 ? declared : ['text'];
      return {
        text: effective.includes('text'),
        image: effective.includes('image'),
        touched: false,
      };
    }

    function buildInput(draft, t) {
      if (!draft) return { value: undefined };
      const value = INPUT_MODALITIES.filter((modality) => draft[modality] === true);
      if (value.length === 0) return { error: t('inputCapabilityMinimum') };
      return { value };
    }

    function validateContextWindow(draft, t) {
      if (!draft) return { value: undefined };
      if (draft.oneMillion) return { value: CONTEXT_1M };
      const raw = typeof draft.value === 'string' ? draft.value.trim() : '';
      if (raw === '') return { value: undefined };
      if (!/^\d+$/.test(raw)) return { error: t('contextInteger') };
      const value = Number(raw);
      if (!Number.isSafeInteger(value) || value < CONTEXT_MIN || value > CONTEXT_MAX) {
        return { error: t('contextRange') };
      }
      return { value };
    }

    function validateLevels(levels, t) {
      let hasThinking = false;
      for (const [level, wire] of Object.entries(levels)) {
        if (level === 'off') continue;
        hasThinking = true;
        if (typeof wire !== 'string' || wire.length === 0) {
          return t('levelNeedsValue', { level: t(LEVEL_LABEL_KEYS[level] || level) });
        }
      }
      if (!hasThinking) return t('atLeastThinking');
      return null;
    }

    /** 从 settings.describe 的 llm-pi-ai 命名空间构建模型清单（含数组下标/覆写标记）。 */
    function inventoryFrom(ns) {
      const out = [];
      if (!ns || typeof ns.value !== 'object' || ns.value === null) return out;
      const providers = ns.value.providers;
      if (typeof providers !== 'object' || providers === null) return out;
      for (const [route, profile] of Object.entries(providers)) {
        if (typeof profile !== 'object' || profile === null) continue;
        if (Array.isArray(profile.models)) {
          profile.models.forEach((entry, index) => {
            if (typeof entry !== 'object' || entry === null) return;
            out.push({
              route, model: entry.id,
              name: typeof entry.name === 'string' && entry.name.length ? entry.name : entry.id,
              levels: entry.reasoningEfforts === undefined ? null : entry.reasoningEfforts,
              contextWindow: Number.isInteger(entry.contextWindow) ? entry.contextWindow : undefined,
              input: Array.isArray(entry.input) ? entry.input : [],
              raw: entry,
              index, inOverrides: false,
            });
          });
        }
        if (typeof profile.modelOverrides === 'object' && profile.modelOverrides !== null) {
          for (const [id, entry] of Object.entries(profile.modelOverrides)) {
            const obj = typeof entry === 'object' && entry !== null ? entry : {};
            out.push({
              route, model: id,
              name: typeof obj.name === 'string' && obj.name.length ? obj.name : id,
              levels: obj.reasoningEfforts === undefined ? null : obj.reasoningEfforts,
              contextWindow: Number.isInteger(obj.contextWindow) ? obj.contextWindow : undefined,
              input: Array.isArray(obj.input) ? obj.input : [],
              raw: obj,
              index: -1, inOverrides: true,
            });
          }
        }
      }
      return out;
    }

    /**
     * 构造档位写入 ops。
     *
     * settings.mutate 的 path 只支持对象字段；把数组下标（models/0/...）
     * 当作路径继续下钻会把 models 解析成对象，最终触发 schema 校验失败。
     * 因此按路由整体替换 models/modelOverrides，同时保留所有未编辑字段。
     */
    function mergeModelUpdate(raw, update) {
      const next = { ...raw };
      if (update.levels !== undefined) next.reasoningEfforts = update.levels;
      if (update.contextWindowTouched === true) {
        if (update.contextWindow === undefined) delete next.contextWindow;
        else next.contextWindow = update.contextWindow;
      }
      if (update.inputTouched === true) {
        if (update.input === undefined) delete next.input;
        else next.input = update.input;
      }
      return next;
    }

    function setOps(inventory, updates) {
      const groups = {};
      for (const update of updates) {
        const item = update && update.item;
        if (!item) continue;
        const type = item.inOverrides ? 'modelOverrides' : 'models';
        const key = item.route + '\\u0000' + type;
        if (!groups[key]) groups[key] = { route: item.route, type, updates: [] };
        groups[key].updates.push(update);
      }
      return Object.values(groups).map((group) => {
        const candidates = inventory.filter((item) => item.route === group.route
          && (group.type === 'modelOverrides' ? item.inOverrides : !item.inOverrides));
        if (group.type === 'modelOverrides') {
          const overrides = {};
          for (const item of candidates) {
            overrides[item.model] = item.raw && typeof item.raw === 'object' ? { ...item.raw } : {};
          }
          for (const update of group.updates) {
            const item = update.item;
            overrides[item.model] = mergeModelUpdate(overrides[item.model] || {}, update);
          }
          return { op: 'set', path: ['providers', group.route, 'modelOverrides'], value: overrides };
        }
        const models = candidates.slice().sort((a, b) => a.index - b.index).map((item) => {
          const update = group.updates.find((candidate) => candidate.item.index === item.index
            && candidate.item.model === item.model);
          const raw = item.raw && typeof item.raw === 'object' ? { ...item.raw } : { id: item.model };
          return update ? mergeModelUpdate(raw, update) : raw;
        });
        return { op: 'set', path: ['providers', group.route, 'models'], value: models };
      });
    }

    function removeDirtyFields(dirty, key, fields) {
      const next = { ...(dirty || {}) };
      const entry = { ...(next[key] || {}) };
      for (const field of fields) delete entry[field];
      if (Object.keys(entry).length === 0) delete next[key];
      else next[key] = entry;
      return next;
    }

    function SectionEditor(props) {
      const connection = props.__connection;
      const locale = props.__locale || { getSnapshot: () => ({ active: 'zh' }), setLocale: () => {} };
      const t = typeof props.t === 'function'
        ? props.t
        : (key, params) => String(zh[key] || key).replace(/\{(\w+)\}/g, (match, name) => params && name in params ? String(params[name]) : match);
      const theme = iosPalette();
      const [state, setState] = React.useState({
        loading: true, inventory: [], revision: 0, expanded: {}, expandedProviders: {}, drafts: {}, contextDrafts: {}, inputDrafts: {}, dirty: {},
        busy: false, error: null, notice: null, query: '', nsFound: true,
        subagent: null, subagentDraft: 'default', subagentCustom: '', quickSettingsOpen: false,
      });

      const load = () => {
        setState(s => ({ ...s, loading: true, error: null }));
        connection.api.settings.describe({}).then((response) => {
          if (!response.result.ok) {
            setState(s => ({ ...s, loading: false, busy: false, error: response.result.error.message }));
            return;
          }
          const namespaces = response.result.value.namespaces || [];
          const ns = namespaces.find(n => n.ns === NS);
          if (!ns) {
            setState(s => ({ ...s, loading: false, busy: false, nsFound: false, inventory: [], subagent: null }));
            return;
          }
          // 子 agent 默认思考强度：存储在 llm-pi-ai 用户层顶层键 subagentEffort
          // （pi-ai schema 会忽略该键但原样持久化，因此从 user 层读取）。
          const rawUser = ns.user && typeof ns.user === 'object' ? ns.user : {};
          const subagent = {
            effort: typeof rawUser.subagentEffort === 'string' && rawUser.subagentEffort.length > 0
              ? rawUser.subagentEffort
              : null,
            revision: typeof ns.revision === 'number' ? ns.revision : 0,
          };
          const subagentDraft = subagent.effort === null
            ? 'default'
            : ALL_LEVELS.includes(subagent.effort) ? subagent.effort : 'custom';
          const subagentCustom = subagentDraft === 'custom' ? subagent.effort : '';
          setState(s => ({
            ...s, loading: false, busy: false, nsFound: true,
            inventory: inventoryFrom(ns), revision: typeof ns.revision === 'number' ? ns.revision : 0,
            subagent, subagentDraft, subagentCustom,
          }));
        }).catch((error) => {
          setState(s => ({ ...s, loading: false, busy: false, error: t('readSettingsFailed', { message: error && error.message ? error.message : String(error) }) }));
        });
      };

      React.useEffect(() => { load(); }, []);

      const applyNamespaceView = (s, ns, notice) => {
        const rawUser = ns && ns.user && typeof ns.user === 'object' ? ns.user : {};
        const effort = typeof rawUser.subagentEffort === 'string' && rawUser.subagentEffort.length > 0
          ? rawUser.subagentEffort
          : null;
        const subagent = { effort, revision: typeof ns.revision === 'number' ? ns.revision : 0 };
        const subagentDraft = effort === null
          ? 'default'
          : ALL_LEVELS.includes(effort) ? effort : 'custom';
        const subagentCustom = subagentDraft === 'custom' ? effort : '';
        return {
          ...s, loading: false, busy: false, nsFound: true,
          inventory: inventoryFrom(ns), revision: typeof ns.revision === 'number' ? ns.revision : 0,
          subagent, subagentDraft, subagentCustom, notice,
        };
      };

      const runOps = (ops, successMessage, onSuccess) => {
        setState(s => ({ ...s, busy: true, error: null, notice: null }));
        connection.api.settings.mutate({ ns: NS, ops, expectedRevision: state.revision }).then((response) => {
          if (!response.result.ok) {
            setState(s => ({ ...s, busy: false, error: t('writeError', { message: response.result.error.message }) }));
            return;
          }
          const nextNamespace = response.result.value;
          if (!nextNamespace || typeof nextNamespace !== 'object') {
            setState(s => ({ ...s, busy: false, error: t('saveMissingNamespace') }));
            return;
          }
          if (typeof onSuccess === 'function') onSuccess();
          setState(s => applyNamespaceView(s, nextNamespace, successMessage || t('settingsUpdated')));
        }).catch(() => {
          setState(s => ({ ...s, busy: false, error: t('writeFailed') }));
        });
      };

      const applyModel = (item) => {
        const key = item.route + '/' + item.model;
        const levels = buildLevels(state.drafts[key] || {});
        const err = validateLevels(levels, t);
        if (err) { setState(s => ({ ...s, error: err })); return; }
        const contextDraft = state.contextDrafts[key] || contextDraftFrom(item);
        const context = contextDraft.touched === true
          ? validateContextWindow(contextDraft, t)
          : { value: undefined };
        if (context.error) { setState(s => ({ ...s, error: context.error })); return; }
        const inputDraft = state.inputDrafts[key] || inputDraftFrom(item);
        const input = inputDraft.touched === true ? buildInput(inputDraft, t) : { value: undefined };
        if (input.error) { setState(s => ({ ...s, error: input.error })); return; }
        runOps(setOps(state.inventory, [{
          item,
          levels,
          contextWindow: context.value,
          contextWindowTouched: contextDraft.touched === true,
          input: input.value,
          inputTouched: inputDraft.touched === true,
        }]), t('modelSettingsSaved'), () => {
          setState(s => ({ ...s, dirty: removeDirtyFields(s.dirty, key, ['levels', 'context', 'input']) }));
        });
      };

      const closeModelEditor = (item) => {
        const key = item.route + '/' + item.model;
        setState(s => {
          const expanded = { ...s.expanded };
          const drafts = { ...s.drafts };
          const contextDrafts = { ...s.contextDrafts };
          const inputDrafts = { ...s.inputDrafts };
          const dirty = { ...s.dirty };
          delete expanded[key];
          delete drafts[key];
          delete contextDrafts[key];
          delete inputDrafts[key];
          delete dirty[key];
          return { ...s, expanded, drafts, contextDrafts, inputDrafts, dirty };
        });
      };

      const restoreReasoningDefaults = (item) => {
        const key = keyOf(item);
        runOps(setOps(state.inventory, [{ item, levels: DEFAULT_LEVELS }]), t('restoreReasoning'), () => {
          setState(s => {
            const drafts = { ...s.drafts };
            if (drafts[key]) drafts[key] = draftFrom(DEFAULT_LEVELS);
            return { ...s, drafts, dirty: removeDirtyFields(s.dirty, key, ['levels']) };
          });
        });
      };

      const restoreProviderDefaults = (item) => {
        runOps(setOps(state.inventory, [{
          item,
          contextWindow: undefined,
          contextWindowTouched: true,
          input: undefined,
          inputTouched: true,
        }]), t('restoreCapability'), () => closeModelEditor(item));
      };
      const applyPreset = (levels) => {
        const updates = state.inventory.map(item => ({ item, levels }));
        runOps(setOps(state.inventory, updates), t('settingsUpdated'), () => {
          setState(s => {
            const drafts = { ...s.drafts };
            let dirty = s.dirty;
            for (const item of s.inventory) {
              const key = keyOf(item);
              if (drafts[key]) drafts[key] = draftFrom(levels);
              dirty = removeDirtyFields(dirty, key, ['levels']);
            }
            return { ...s, drafts, dirty };
          });
        });
      };

      const choosePreset = (preset) => {
        setState(s => ({ ...s, quickSettingsOpen: false }));
        applyPreset(preset.levels);
      };

      // 子 agent 思考强度：写入本插件命名空间 dsh-thinking-effort。
      const applySubagentEffort = () => {
        const ops = [];
        if (state.subagentDraft === 'default') {
          ops.push({ op: 'unset', path: ['subagentEffort'] });
        } else {
          const value = state.subagentDraft === 'custom'
            ? state.subagentCustom.trim()
            : state.subagentDraft;
          if (value.length === 0) {
            setState(s => ({ ...s, notice: null, error: t('customEffortRequired') }));
            return;
          }
          ops.push({ op: 'set', path: ['subagentEffort'], value });
        }
        setState(s => ({ ...s, busy: true, error: null, notice: null }));
        connection.api.settings.mutate({ ns: NS, ops, expectedRevision: state.subagent ? state.subagent.revision : 0 }).then((response) => {
          if (!response.result.ok) {
            setState(s => ({ ...s, busy: false, error: t('writeError', { message: response.result.error.message }) }));
            return;
          }
          const nextNamespace = response.result.value;
          if (!nextNamespace || typeof nextNamespace !== 'object') {
            setState(s => ({ ...s, busy: false, error: t('saveMissingNamespace') }));
            return;
          }
          setState(s => applyNamespaceView(s, nextNamespace, t('subagentSaved')));
        }).catch((error) => {
          setState(s => ({ ...s, busy: false, error: t('writeError', { message: error && error.message ? error.message : String(error) }) }));
        });
      };

      const keyOf = (item) => item.route + '/' + item.model;
      const toggleProvider = (route) => {
        setState(s => {
          const expandedProviders = { ...(s.expandedProviders || {}) };
          expandedProviders[route] = expandedProviders[route] !== true;
          return { ...s, expandedProviders };
        });
      };

      const toggleExpand = (item) => {
        const key = keyOf(item);
        setState(s => {
          const expanded = { ...s.expanded };
          if (expanded[key]) {
            delete expanded[key];
            return { ...s, expanded };
          }
          expanded[key] = true;
          const drafts = { ...s.drafts };
          const contextDrafts = { ...s.contextDrafts };
          const inputDrafts = { ...s.inputDrafts };
          if (!drafts[key]) drafts[key] = draftFrom(item.levels);
          if (!contextDrafts[key]) contextDrafts[key] = contextDraftFrom(item);
          if (!inputDrafts[key]) inputDrafts[key] = inputDraftFrom(item);
          return { ...s, expanded, drafts, contextDrafts, inputDrafts };
        });
      };
      const patchDraft = (item, level, patch) => {
        const key = keyOf(item);
        setState(s => {
          const current = (s.drafts[key] && s.drafts[key][level]) || { on: false, wire: '' };
          const next = { ...current, ...patch };
          if (level !== 'off' && patch.on === true && String(next.wire || '').trim() === '') next.wire = level;
          return {
            ...s,
            notice: null,
            dirty: { ...s.dirty, [key]: { ...(s.dirty[key] || {}), levels: true } },
            drafts: { ...s.drafts, [key]: { ...s.drafts[key], [level]: next } },
          };
        });
      };

      const patchContextValue = (item, value) => {
        const key = keyOf(item);
        setState(s => {
          const current = s.contextDrafts[key] || contextDraftFrom(item);
          return {
            ...s,
            notice: null,
            dirty: { ...s.dirty, [key]: { ...(s.dirty[key] || {}), context: true } },
            contextDrafts: {
              ...s.contextDrafts,
              [key]: { ...current, value, previousValue: value, oneMillion: false, touched: true },
            },
          };
        });
      };

      const setOneMillion = (item, enabled) => {
        const key = keyOf(item);
        setState(s => {
          const current = s.contextDrafts[key] || contextDraftFrom(item);
          const previousValue = enabled
            ? (current.oneMillion ? current.previousValue : current.value)
            : current.previousValue;
          return {
            ...s,
            notice: null,
            dirty: { ...s.dirty, [key]: { ...(s.dirty[key] || {}), context: true } },
            contextDrafts: {
              ...s.contextDrafts,
              [key]: {
                ...current,
                oneMillion: enabled,
                previousValue: previousValue || '',
                value: enabled ? String(CONTEXT_1M) : (previousValue || ''),
                touched: true,
              },
            },
          };
        });
      };

      const patchInputCapability = (item, modality, enabled) => {
        const key = keyOf(item);
        setState(s => {
          const current = s.inputDrafts[key] || inputDraftFrom(item);
          const other = modality === 'text' ? 'image' : 'text';
          if (!enabled && current[other] !== true) {
            return { ...s, notice: null, error: t('inputCapabilityMinimum') };
          }
          return {
            ...s,
            error: null,
            notice: null,
            dirty: { ...s.dirty, [key]: { ...(s.dirty[key] || {}), input: true } },
            inputDrafts: {
              ...s.inputDrafts,
              [key]: { ...current, [modality]: enabled, touched: true },
            },
          };
        });
      };

      const inventory = state.inventory;
      const query = (state.query || '').trim().toLowerCase();
      const visible = query === ''
        ? inventory
        : inventory.filter(i => String(i.model || '').toLowerCase().includes(query)
          || String(i.name || '').toLowerCase().includes(query));
      const routes = [];
      for (const item of visible) { if (!routes.includes(item.route)) routes.push(item.route); }
      const expandedCount = visible.filter(item => state.expanded[keyOf(item)] === true && (query !== '' || (state.expandedProviders && state.expandedProviders[item.route] === true))).length;

      const localeSnapshot = locale.getSnapshot();
      const levelLabel = (level) => t(LEVEL_LABEL_KEYS[level] || level);
      const subagentOptions = [['default', t('providerDefault')]]
        .concat(ALL_LEVELS.map(level => [level, levelLabel(level)]))
        .concat([['custom', t('customize')]]);

      const summary = (item) => {
        const input = Array.isArray(item.input) && item.input.length > 0 ? item.input : ['text'];
        let context = null;
        if (Number.isInteger(item.contextWindow)) {
          const value = item.contextWindow;
          const label = value === CONTEXT_1M
            ? '1M'
            : value >= 1024
              ? String(Math.round(value / 1024)) + 'K'
              : String(value);
          context = { label: t('contextLabel', { label }), title: t('contextTitle', { value }) };
        }
        return { text: input.includes('text'), image: input.includes('image'), context };
      };

      return React.createElement('div', { style: { position: 'relative', maxWidth: '920px', margin: '0 auto', padding: '6px 8px 34px', color: theme.text, fontFamily: '-apple-system, BlinkMacSystemFont, SF Pro Text, Segoe UI, sans-serif' } },
        React.createElement('label', { style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', fontSize: '12px', marginBottom: '4px' } },
          t('languageLabel'),
          React.createElement('select', {
            value: localeSnapshot.active,
            onChange: (e) => locale.setLocale(e.target.value),
            style: { height: '26px', padding: '0 7px', border: '1px solid ' + theme.border, borderRadius: '7px', backgroundColor: theme.field, color: theme.text, fontSize: '12px' },
          }, React.createElement('option', { value: 'zh' }, t('languageChinese')), React.createElement('option', { value: 'en' }, t('languageEnglish')), React.createElement('option', { value: 'ja' }, t('languageJapanese')), React.createElement('option', { value: 'ko' }, t('languageKorean'))),
        ),
        React.createElement('h3', { style: { display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: '8px', rowGap: '4px', fontSize: '18px', lineHeight: '24px', fontWeight: 700, letterSpacing: 0, margin: '0 0 7px' } },
          svgIcon('sliders', 19), React.createElement('span', null, t('pageTitle')),
          state.notice ? React.createElement('span', { role: 'status', 'aria-live': 'polite', style: { display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: 'auto', padding: '2px 6px', border: '1px solid ' + theme.accentBorder, borderRadius: '6px', color: theme.accent, backgroundColor: theme.accentSoft, fontSize: '11px', lineHeight: '16px', fontWeight: 650 } }, svgIcon('check', 12), state.notice) : null),
        state.error ? React.createElement('div', { role: 'alert', 'aria-live': 'assertive', style: { fontSize: '12px', lineHeight: '18px', color: theme.danger, backgroundColor: theme.dangerBg, border: '1px solid ' + theme.dangerBorder, borderRadius: '8px', padding: '6px 8px', margin: '0 0 8px' } }, state.error) : null,
        React.createElement('div', { style: { backgroundColor: theme.group, border: '1px solid ' + theme.border, borderRadius: '8px', boxShadow: theme.shadow, overflow: 'hidden', marginBottom: '8px' } },
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 8px 1px', fontSize: '13px', fontWeight: 700, letterSpacing: 0 } },
            svgIcon('sparkles', 15), React.createElement('span', null, t('subagentCardTitle'))),
          React.createElement('div', { style: { padding: '0 8px', fontSize: '12px', color: theme.secondary, marginBottom: '5px' } },
            state.subagent
              ? t('currentDefault', { effort: state.subagent.effort || t('providerDefault') })
              : t('unconfiguredSubagent')),
          React.createElement('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', padding: '6px 8px 7px', borderTop: '1px solid ' + theme.divider } },
            React.createElement('select', {
              value: state.subagentDraft,
              disabled: state.busy,
              onChange: (e) => setState(s => ({ ...s, notice: null, subagentDraft: e.target.value })),
              style: { height: '28px', minWidth: '136px', padding: '0 10px', border: '1px solid ' + theme.border, borderRadius: '8px', fontSize: '13px', fontWeight: 500, backgroundColor: theme.field, color: theme.text, colorScheme: 'light dark', boxShadow: theme.shadow },
            }, subagentOptions.map(function (pair) {
              return React.createElement('option', { key: pair[0], value: pair[0], style: { backgroundColor: 'Canvas', color: 'CanvasText' } }, pair[1]);
            })),
            state.subagentDraft === 'custom'
              ? React.createElement('input', {
                  type: 'text',
                  value: state.subagentCustom,
                  placeholder: t('customPlaceholder'),
                  style: { flex: '1 1 160px', minWidth: '140px', height: '28px', padding: '0 8px', border: '1px solid ' + theme.border, borderRadius: '8px', fontSize: '13px', backgroundColor: theme.field, color: theme.text, outline: 'none' },
                  onChange: (e) => setState(s => ({ ...s, notice: null, subagentCustom: e.target.value })),
                })
              : null,
            btn(t('apply'), applySubagentEffort, state.busy, 'primary', theme, 'check'),
          ),
        ),
        state.nsFound === false
          ? React.createElement('p', { style: { fontSize: '12px', opacity: 0.75 } }, t('noNamespace'))
          : React.createElement('div', null,
            React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: state.quickSettingsOpen ? '4px' : '6px' } },
              btn(t('quickSettings'), () => setState(s => ({ ...s, quickSettingsOpen: !s.quickSettingsOpen })), state.busy, 'secondary', theme, state.quickSettingsOpen ? 'chevronUp' : 'sliders'),
              state.quickSettingsOpen
                ? React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', flexBasis: '100%', padding: '4px', border: '1px solid ' + theme.border, borderRadius: '8px', backgroundColor: theme.field } },
                    PRESETS.map(preset => btn(t(preset.labelKey), () => choosePreset(preset), state.busy, 'secondary', theme, preset.key === 'official' ? 'sparkles' : 'sliders')),
                  )
                : null,
            ),
            React.createElement('div', { style: { position: 'relative', marginBottom: '7px' } },
              React.createElement('span', { style: { position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: theme.secondary, pointerEvents: 'none' } }, svgIcon('search', 15)),
              React.createElement('input', {
                type: 'text',
                value: state.query,
                placeholder: t('searchPlaceholder'),
                style: { boxSizing: 'border-box', width: '100%', height: '30px', padding: '0 10px 0 30px', border: '1px solid ' + theme.border, borderRadius: '8px', fontSize: '13px', backgroundColor: theme.field, color: theme.text, outline: 'none', boxShadow: theme.shadow },
                onChange: (e) => setState(s => ({ ...s, query: e.target.value })),
              }),
            ),
            state.loading
              ? React.createElement('div', { style: { fontSize: '12px', opacity: 0.7 } }, t('loading'))
              : visible.length === 0
                ? React.createElement('div', { style: { fontSize: '12px', opacity: 0.7 } }, inventory.length === 0 ? t('noModels') : t('noMatches'))
                : routes.map(route => {
                    const providerModels = visible.filter(i => i.route === route);
                    const providerOpen = query !== '' || (state.expandedProviders && state.expandedProviders[route] === true);
                    return React.createElement('div', { key: route, style: { marginBottom: '6px' } },
                      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: '8px', minHeight: '32px', padding: '4px 6px', marginBottom: '4px', border: '1px solid ' + theme.border, borderRadius: '8px', backgroundColor: theme.raised } },
                        React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 } },
                          React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', minWidth: '22px', border: '1px solid ' + theme.border, borderRadius: '7px', color: theme.secondary, backgroundColor: theme.group } }, svgIcon('layers', 14)),
                          React.createElement('span', { style: { display: 'grid', gap: '1px', minWidth: 0 } },
                            React.createElement('span', { style: { color: theme.text, fontSize: '12px', fontWeight: 700, overflowWrap: 'anywhere' } }, route),
                            React.createElement('span', { style: { color: theme.accent, fontSize: '10px', lineHeight: '11px', fontWeight: 700 } }, t('vendor')),
                          ),
                        ),
                        React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: theme.secondary, whiteSpace: 'nowrap' } },
                          React.createElement('span', null, t('modelCount', { count: providerModels.length })),
                          query !== ''
                            ? React.createElement('span', { style: { fontSize: '11px', color: theme.secondary } }, t('searchResults'))
                            : btn('', () => toggleProvider(route), false, 'ghost', theme, providerOpen ? 'chevronUp' : 'chevronDown', providerOpen ? t('collapseProvider') : t('expandProvider')),
                        ),
                      ),
                      providerOpen ? providerModels.map(item => {
                      const key = keyOf(item);
                      const open = state.expanded[key] === true;
                      const draft = state.drafts[key];
                      const contextDraft = state.contextDrafts[key] || contextDraftFrom(item);
                      const inputDraft = state.inputDrafts[key] || inputDraftFrom(item);
                      const meta = summary(item);
                      const dirty = state.dirty[key] || {};
                      const modelDirty = dirty.levels === true || dirty.context === true || dirty.input === true;
                      return React.createElement('div', { key: key, style: { border: '1px solid ' + (open ? theme.accent : modelDirty ? theme.accentBorder : theme.border), borderRadius: '8px', marginBottom: '4px', backgroundColor: open ? theme.raised : theme.group, boxShadow: theme.shadow, overflow: 'hidden', transition: 'background-color 160ms ease, border-color 160ms ease' } },
                        React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: '8px', minHeight: '42px', padding: '4px 6px 4px 8px' } },
                          React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 } },
                            React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', minWidth: '22px', borderRadius: '7px', color: theme.accent, backgroundColor: theme.field } }, svgIcon('model', 14)),
                            React.createElement('span', { style: { display: 'grid', gap: '1px', minWidth: 0 } },
                              React.createElement('span', { style: { minWidth: 0, fontSize: '13px', lineHeight: '15px', fontWeight: 700, overflowWrap: 'anywhere' } }, item.model),
                              React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '5px', fontSize: '10px', lineHeight: '11px', color: theme.secondary } },
                                React.createElement('span', null, t('model')),
                                modelDirty ? React.createElement('span', { title: t('unsaved'), style: { padding: '1px 4px', border: '1px solid ' + theme.accentBorder, borderRadius: '5px', color: theme.accent, backgroundColor: theme.accentSoft, fontSize: '9px', lineHeight: '11px', fontWeight: 700 } }, t('unsaved')) : null,
                              ),
                            ),
                          ),
                          React.createElement('span', { style: { display: 'grid', gridTemplateColumns: '154px 28px', columnGap: '8px', alignItems: 'center' } },
                            React.createElement('span', { style: { display: 'grid', gridTemplateColumns: '22px 22px minmax(86px, 1fr)', columnGap: '8px', alignItems: 'center', color: theme.secondary } },
                              React.createElement('span', { title: meta.text ? t('textEnabled') : t('textDisabled'), 'aria-label': meta.text ? t('textEnabled') : t('textDisabled'), style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', color: meta.text ? theme.accent : theme.secondary, border: '1px solid ' + (meta.text ? theme.accentBorder : theme.border), borderRadius: '6px', backgroundColor: meta.text ? theme.accentSoft : theme.raised } }, svgIcon('text', 14)),
                              React.createElement('span', { title: meta.image ? t('imageEnabled') : t('imageDisabled'), 'aria-label': meta.image ? t('imageEnabled') : t('imageDisabled'), style: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '22px', height: '22px', color: meta.image ? theme.accent : theme.secondary, border: '1px solid ' + (meta.image ? theme.accentBorder : theme.border), borderRadius: '6px', backgroundColor: meta.image ? theme.accentSoft : theme.raised } }, svgIcon('image', 14)),
                              React.createElement('span', { title: meta.context ? meta.context.title : undefined, 'aria-label': meta.context ? meta.context.title : undefined, style: { display: 'inline-flex', alignItems: 'center', gap: '4px', minHeight: '22px', padding: meta.context ? '0 5px' : 0, border: meta.context ? '1px solid ' + theme.border : '1px solid transparent', borderRadius: '6px', backgroundColor: meta.context ? theme.raised : 'transparent', whiteSpace: 'nowrap' } },
                                meta.context ? svgIcon('context', 14) : null,
                                meta.context ? React.createElement('span', { style: { fontSize: '11px', fontWeight: 700 } }, meta.context.label) : null,
                              ),
                            ),
                            btn('', () => toggleExpand(item), false, 'ghost', theme, open ? 'chevronUp' : 'settings', open ? t('closeModelSettings') : t('openModelSettings')),
                          ),
                        ),
                        open && draft
                          ? React.createElement('div', { style: { padding: '8px', borderTop: '1px solid ' + theme.divider, backgroundColor: theme.group } },
                            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '6px', marginBottom: '6px' } },
                              React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', alignItems: 'center', gap: '8px', minWidth: 0, padding: '7px', border: '1px solid ' + theme.border, borderRadius: '8px', backgroundColor: theme.field } },
                              React.createElement('span', { style: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 650 } },
                                svgIcon('context', 15), React.createElement('span', null, t('contextLength'))),
                              React.createElement('input', {
                                type: 'number',
                                inputMode: 'numeric',
                                min: CONTEXT_MIN,
                                max: CONTEXT_MAX,
                                step: 1,
                                value: contextDraft.oneMillion ? String(CONTEXT_1M) : contextDraft.value,
                                disabled: state.busy || contextDraft.oneMillion,
                                placeholder: t('providerDefaultShort'),
                                'aria-label': t('contextLength'),
                                style: { boxSizing: 'border-box', width: '100%', minWidth: 0, height: '28px', padding: '0 8px', border: '1px solid ' + theme.border, borderRadius: '8px', fontSize: '13px', backgroundColor: theme.group, color: theme.text, outline: 'none' },
                                onChange: (e) => patchContextValue(item, e.target.value),
                              }),
                              React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', minWidth: 0, fontSize: '12px', whiteSpace: 'nowrap' } },
                                React.createElement('span', null, t('oneMillionMode')),
                                iosSwitch(contextDraft.oneMillion, (enabled) => setOneMillion(item, enabled), state.busy, t('oneMillionMode'), theme),
                              ),
                            ),
                              React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'center', gap: '8px', minWidth: 0, padding: '7px', border: '1px solid ' + theme.border, borderRadius: '8px', backgroundColor: theme.field } },
                              React.createElement('span', { style: { fontSize: '13px', fontWeight: 650 } }, t('inputCapabilities')),
                                React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', minWidth: 0, fontSize: '12px', whiteSpace: 'nowrap' } },
                                React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '5px' } }, svgIcon('text', 14), React.createElement('span', null, t('textInput'))),
                                iosSwitch(inputDraft.text, (enabled) => patchInputCapability(item, 'text', enabled), state.busy, t('textInput'), theme),
                              ),
                                React.createElement('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', minWidth: 0, fontSize: '12px', whiteSpace: 'nowrap' } },
                                React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '5px' } }, svgIcon('image', 14), React.createElement('span', null, t('imageInput'))),
                                iosSwitch(inputDraft.image, (enabled) => patchInputCapability(item, 'image', enabled), state.busy, t('imageInput'), theme),
                              ),
                              ),
                            ),
                            React.createElement('div', { style: { fontSize: '12px', fontWeight: 700, color: theme.secondary, margin: '0 0 4px 2px' } }, t('reasoningLevels')),
                            React.createElement('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', marginBottom: '2px', border: '1px solid ' + theme.border, borderRadius: '8px', backgroundColor: theme.field, overflow: 'hidden' } },
                              ALL_LEVELS.map((level, index) => {
                              const cell = draft[level];
                              return React.createElement('div', { key: level, style: { display: 'grid', gridTemplateColumns: '44px 58px minmax(0, 1fr)', alignItems: 'center', gap: '8px', minHeight: '30px', padding: '2px 8px', borderBottom: index < ALL_LEVELS.length - 1 ? '1px solid ' + theme.divider : 'none', backgroundColor: cell.on ? theme.raised : 'transparent', fontSize: '12px' } },
                                iosSwitch(cell.on, (enabled) => patchDraft(item, level, { on: enabled }), state.busy, levelLabel(level) + t('levelSuffix'), theme),
                                React.createElement('span', { style: { width: '58px', fontSize: '13px', fontWeight: 650 } }, levelLabel(level)),
                                cell.on
                                  ? React.createElement('input', {
                                    type: 'text',
                                    value: cell.wire,
                                    disabled: state.busy,
                                    placeholder: level === 'off' ? t('offPlaceholder') : t('wirePlaceholder'),
                                    style: { boxSizing: 'border-box', width: '100%', minWidth: 0, height: '26px', padding: '0 8px', border: '1px solid ' + theme.border, borderRadius: '8px', fontSize: '13px', backgroundColor: theme.group, color: theme.text, outline: 'none' },
                                    onChange: (e) => patchDraft(item, level, { wire: e.target.value }),
                                  })
                                  : null,
                              );
                              }),
                            ),
                            React.createElement('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px', paddingTop: '6px', borderTop: '1px solid ' + theme.divider } },
                              btn(modelDirty ? t('saveChanges') : t('saved'), () => applyModel(item), state.busy || !modelDirty, 'primary', theme, 'check', modelDirty ? t('saveModelChanges') : t('noPendingChanges')),
                              btn(t('restoreReasoning'), () => restoreReasoningDefaults(item), state.busy, 'secondary', theme, 'restore'),
                              btn(t('restoreCapability'), () => restoreProviderDefaults(item), state.busy, 'danger', theme, 'restore'),
                            ),
                          )
                          : null,
                      );
                      }) : null,
                    );
                  }),
            expandedCount > 0
              ? React.createElement('div', { style: { fontSize: '12px', color: theme.secondary, margin: '4px 2px 0' } }, t('expandedSettings', { count: expandedCount }))
              : null,
          ),
          React.createElement('span', {
            'aria-label': t('versionLabel'),
            style: { position: 'absolute', right: '12px', bottom: '8px', fontSize: '10px', lineHeight: '14px', opacity: 0.45, pointerEvents: 'none', userSelect: 'none' },
          }, 'v' + PLUGIN_VERSION),
      );
    }

    module.exports = {
      name: '@hytime/dsh-thinking-effort',
      inject: ['slots', 'connection', 'locale'],
      apply(ctx) {
        const slots = ctx.get('slots');
        if (slots === undefined) return;
        const connection = ctx.get('connection');
        if (connection === undefined) return;
        const locale = ctx.get('locale');
        if (locale === undefined) return;
        ctx.effect(() => locale.register(LOCALE_NS, { zh, en, ja, ko }), 'dsh-thinking-effort: dictionaries');
        const t = locale.bind(LOCALE_NS);
        slots.inject('settings.section', () => slots.register(
          { name: 'settings.section', id: 'thinking-effort', order: 12, locale: LOCALE_NS, label: () => t('pageTitle') },
          (props) => React.createElement(SectionEditor, Object.assign({}, props, { __connection: connection, __locale: locale })),
        ));
      },
    };

    return module.exports;
  },
});
