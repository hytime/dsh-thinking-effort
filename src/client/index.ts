import { createElement } from 'react'
import { LOCALE_DATA } from './locales.js'
import { settingsBridge } from './settings-bridge.js'
import { createTakeoverRuntimeStore, observeTakeoverSettings } from './takeover-runtime.js'
import { LOCALE_NS } from './constants.js'
import { SectionEditor } from './SectionEditor.js'
import { LegacyMigrationModal } from './components/LegacyMigrationModal.js'
import { apply as registerComposerSeat } from './thinking-slider/index.js'
import type { ClientContext, ClientLocale, ClientSlots, ConfigFormsService } from './types.js'

export const name = '@hytime/dsh-thinking-effort'
export const inject = ['slots', 'connection', 'locale'] as const

const SLOT_NAME = 'settings.section'
// A UI Slot id, unrelated to the settings section id (`PLUGIN_ENTRY_ID`).
const SLOT_ID = 'thinking-effort'
const SLOT_ORDER = 12
const OVERLAY_NAME = 'shell.overlay'
const OVERLAY_ID = 'thinking-effort-legacy-migration'
const OVERLAY_ORDER = 40

function hasLanguage(locale: ClientLocale, id: string): boolean {
  const snapshot = locale.getSnapshot?.()
  return Array.isArray(snapshot?.locales) && snapshot.locales.some((entry) => entry?.id === id)
}

/**
 * A live view of the optional `ctx.configForms` service (DSH 0.1.7+).
 *
 * The service belongs to `@deepseek-ai/dsh-client-ui-settings`, whose fiber can
 * activate AFTER this plugin's `apply` (client entries are created
 * concurrently), and `mount()` registers its slots exactly once. Re-reading on
 * every `get` therefore lets a late arrival reach an editor that is already
 * mounted, and keeps `configForms` out of the static `inject` array — a
 * declared-but-missing service parks the whole fiber.
 *
 * @param context - The client context whose service table is re-read per call.
 * @returns A `ConfigFormsService` face that is never itself `undefined`; `get`
 *   answers `undefined` while the real service has not been provided yet.
 */
function configFormsView(context: ClientContext): ConfigFormsService {
  const resolve = (): ConfigFormsService | undefined => {
    const value = context.get('configForms')
    return value !== null && typeof value === 'object' && typeof (value as ConfigFormsService).get === 'function'
      ? value as ConfigFormsService
      : undefined
  }
  return { get: (entryId) => resolve()?.get(entryId) }
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

    slots.inject(OVERLAY_NAME, () => slots.register(
      { name: OVERLAY_NAME, id: OVERLAY_ID, order: OVERLAY_ORDER },
      () => createElement(LegacyMigrationModal, { settings: observedSettings, t: translate }),
    ))
  }

  const mountFromRemote = (): void => {
    mount(settingsBridge(connection, context.get('remote.settings'), locale.addLanguage, configFormsView(context)))
  }
  mountFromRemote()
  context.on('internal/service', (serviceName) => {
    if (serviceName === 'remote.settings' || serviceName === 'remote' || serviceName === 'configForms') mountFromRemote()
  })

  // Register the composer model slider seat after declaring the Settings page.
  // The seat itself uses a declared `inject` on `modelDirectories`, so it can be
  // dispatched at the top level without waiting on the Settings bridge.
  registerComposerSeat(context)
}
