import en from '../locales/en.json' with { type: 'json' }
import ja from '../locales/ja.json' with { type: 'json' }
import ko from '../locales/ko.json' with { type: 'json' }
import zh from '../locales/zh.json' with { type: 'json' }
import type { LocaleCode, LocaleDictionary } from './types.js'

export const LOCALE_CODES = ['zh', 'en', 'ja', 'ko'] as const satisfies readonly LocaleCode[]
export const LOCALE_DATA: Record<LocaleCode, LocaleDictionary> = { zh, en, ja, ko }
export { zh, en, ja, ko }
