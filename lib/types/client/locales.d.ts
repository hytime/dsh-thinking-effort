import en from '../locales/en.json';
import ja from '../locales/ja.json';
import ko from '../locales/ko.json';
import zh from '../locales/zh.json';
import type { LocaleCode, LocaleDictionary } from './types.js';
export declare const LOCALE_CODES: readonly ["zh", "en", "ja", "ko"];
export declare const LOCALE_DATA: Record<LocaleCode, LocaleDictionary>;
export { zh, en, ja, ko };
