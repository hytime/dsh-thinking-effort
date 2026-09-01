import { createElement } from 'react'
import { LOCALE_DATA } from './locales.js'
import { settingsBridge } from './settings-bridge.js'
import { createTakeoverRuntimeStore, observeTakeoverSettings } from './takeover-runtime.js'
import { LOCALE_NS } from './constants.js'
import { SectionEditor } from './SectionEditor.js'
import type { ClientContext, ClientLocale, ClientSlots } from './types.js'

export const name = '@hytime/dsh-thinking-effort'
export const inject = ['slots', 'connection', 'locale'] as const

const SLOT_NAME = 'settings.section'
const SLOT_ID = 'thinking-effort'
const SLOT_ORDER = 12

function hasLanguage(locale: ClientLocale, id: string): boolean {
  const snapshot = locale.getSnapshot?.()
  return Array.isArray(snapshot?.locales) && snapshot.locales.some((entry) => entry?.id === id)
}

export function apply(context: ClientContext): void {
  const slots = context.get('slots') as ClientSlots | undefined
  if (slots === undefined) return
  const connection = context.get('connection') as import('./types.js').ClientConnection | undefined
  const locale = context.get('locale') as ClientLocale
  let mounted = false

  const mount = (settings: ReturnType<typeof settingsBridge>): void => {
    if (mounted || settings === undefined) return
    mounted = true
    const runtime = createTakeoverRuntimeStore()
    const observedSettings = observeTakeoverSettings(settings, runtime.update)
    const translate = locale.bind(LOCALE_NS)
    context.effect(() => {
      const languageDisposers: Array<() => void> = []
      const disposeDictionaries = locale.register(LOCALE_NS, LOCALE_DATA)
      const canRegisterExternalLanguages = settings.externalLanguages && typeof locale.addLanguage === 'function'
      try {
        if (canRegisterExternalLanguages && !hasLanguage(locale, 'ja')) {
          languageDisposers.push(locale.addLanguage!({ id: 'ja', label: translate('languageJapanese'), fallback: 'en' }))
        }
        if (canRegisterExternalLanguages && !hasLanguage(locale, 'ko')) {
          languageDisposers.push(locale.addLanguage!({ id: 'ko', label: translate('languageKorean'), fallback: 'en' }))
        }
      } catch (error) {
        for (const dispose of languageDisposers.reverse()) dispose()
        disposeDictionaries()
        runtime.dispose()
        observedSettings.dispose()
        throw error
      }
      return () => {
        observedSettings.dispose()
        runtime.dispose()
        for (const dispose of languageDisposers.reverse()) dispose()
        disposeDictionaries()
      }
    }, 'dsh-thinking-effort: language pack dictionaries')

    slots.inject(SLOT_NAME, () => slots.register(
      {
        name: SLOT_NAME,
        id: SLOT_ID,
        order: SLOT_ORDER,
        locale: LOCALE_NS,
        label: () => translate('pageTitle'),
      },
      () => createElement(SectionEditor, { settings: observedSettings, locale, t: translate, takeoverRuntime: runtime }),
    ))
  }

  const mountFromRemote = (): void => {
    mount(settingsBridge(connection, context.get('remote.settings'), locale.addLanguage))
  }
  mountFromRemote()
  context.on('internal/service', (serviceName) => {
    if (serviceName === 'remote.settings' || serviceName === 'remote') mountFromRemote()
  })
}
