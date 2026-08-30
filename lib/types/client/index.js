import { createElement } from 'react';
import { LOCALE_DATA } from './locales.js';
import { settingsBridge } from './settings-bridge.js';
import { LOCALE_NS } from './constants.js';
import { SectionEditor } from './SectionEditor.js';
export const name = '@hytime/dsh-thinking-effort';
export const inject = ['slots', 'connection', 'locale'];
const SLOT_NAME = 'settings.section';
const SLOT_ID = 'thinking-effort';
const SLOT_ORDER = 12;
function hasLanguage(locale, id) {
    const snapshot = locale.getSnapshot?.();
    return Array.isArray(snapshot?.locales) && snapshot.locales.some((entry) => entry?.id === id);
}
export function apply(context) {
    const slots = context.get('slots');
    if (slots === undefined)
        return;
    const connection = context.get('connection');
    const locale = context.get('locale');
    let mounted = false;
    const mount = (settings) => {
        if (mounted || settings === undefined)
            return;
        mounted = true;
        const translate = locale.bind(LOCALE_NS);
        context.effect(() => {
            const languageDisposers = [];
            const disposeDictionaries = locale.register(LOCALE_NS, LOCALE_DATA);
            const canRegisterExternalLanguages = settings.externalLanguages && typeof locale.addLanguage === 'function';
            try {
                if (canRegisterExternalLanguages && !hasLanguage(locale, 'ja')) {
                    languageDisposers.push(locale.addLanguage({ id: 'ja', label: translate('languageJapanese'), fallback: 'en' }));
                }
                if (canRegisterExternalLanguages && !hasLanguage(locale, 'ko')) {
                    languageDisposers.push(locale.addLanguage({ id: 'ko', label: translate('languageKorean'), fallback: 'en' }));
                }
            }
            catch (error) {
                for (const dispose of languageDisposers.reverse())
                    dispose();
                disposeDictionaries();
                throw error;
            }
            return () => {
                for (const dispose of languageDisposers.reverse())
                    dispose();
                disposeDictionaries();
            };
        }, 'dsh-thinking-effort: language pack dictionaries');
        slots.inject(SLOT_NAME, () => slots.register({
            name: SLOT_NAME,
            id: SLOT_ID,
            order: SLOT_ORDER,
            locale: LOCALE_NS,
            label: () => translate('pageTitle'),
        }, () => createElement(SectionEditor, { settings, locale, t: translate })));
    };
    mount(settingsBridge(connection, undefined));
    context.inject(['remote.settings'], (remoteContext) => {
        mount(settingsBridge(connection, remoteContext.get('remote.settings')));
    });
}
//# sourceMappingURL=index.js.map