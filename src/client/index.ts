import { clientCapabilities } from '../compat/capabilities.js'
import { LOCALE_DATA } from './locales.js'
import { settingsBridge } from './settings-bridge.js'
import { LOCALE_NS } from './constants.js'
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
    context.effect(() => {
      const languageDisposers: Array<() => void> = []
      const disposeDictionaries = locale.register(LOCALE_NS, LOCALE_DATA)
      const capabilities = clientCapabilities({ addLanguage: locale.addLanguage })
      try {
        if (capabilities.externalLanguages && !hasLanguage(locale, 'ja')) {
          languageDisposers.push(locale.addLanguage!({ id: 'ja', label: '日本語', fallback: 'en' }))
        }
        if (capabilities.externalLanguages && !hasLanguage(locale, 'ko')) {
          languageDisposers.push(locale.addLanguage!({ id: 'ko', label: '한국어', fallback: 'en' }))
        }
      } catch (error) {
        for (const dispose of languageDisposers.reverse()) dispose()
        disposeDictionaries()
        throw error
      }
      return () => {
        for (const dispose of languageDisposers.reverse()) dispose()
        disposeDictionaries()
      }
    }, 'dsh-thinking-effort: language pack dictionaries')

    const translate = locale.bind(LOCALE_NS)
    slots.inject(SLOT_NAME, () => slots.register(
      {
        name: SLOT_NAME,
        id: SLOT_ID,
        order: SLOT_ORDER,
        locale: LOCALE_NS,
        label: () => translate('pageTitle'),
      },
      () => null,
    ))
  }

  mount(settingsBridge(connection, undefined))
  context.inject(['remote.settings'], (remoteContext) => {
    mount(settingsBridge(connection, remoteContext.get('remote.settings')))
  })
}
