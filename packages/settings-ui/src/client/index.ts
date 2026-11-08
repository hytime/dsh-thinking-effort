import { createElement } from 'react'
import { partEnabled } from '@hytime/dsh-plugin-kit'
import { LOCALE_DATA } from './locales.js'
import { settingsBridge } from './settings-bridge.js'
import { createTakeoverRuntimeStore, observeTakeoverSettings } from './takeover-runtime.js'
import { LOCALE_NS } from './constants.js'
import { SectionEditor } from './SectionEditor.js'
import { LegacyMigrationModal } from './components/LegacyMigrationModal.js'
import type { ClientContext, ClientLocale, ClientSlots, ComponentSwitchStore, ConfigFormsService } from '@hytime/dsh-plugin-kit'
import { useSyncExternalStore } from 'react'

export const name = '@hytime/dsh-thinking-effort'
export const inject = ['slots', 'connection', 'locale'] as const

/**
 * The legacy-migration dialog, rendered only while its Loader row is on.
 *
 * The slot itself stays registered for the life of the page: a slot cannot be
 * un-registered and re-registered on a switch change, so the row is consulted
 * per render instead. Returning `null` is what makes toggling the row take
 * effect without a page refresh.
 */
function MigrationOverlayGate({ settings, t, switches }: {
  readonly settings: Parameters<typeof LegacyMigrationModal>[0]['settings']
  readonly t: Parameters<typeof LegacyMigrationModal>[0]['t']
  readonly switches?: ComponentSwitchStore
}): ReturnType<typeof createElement> | null {
  const snapshot = useSyncExternalStore(
    switches?.subscribe ?? (() => () => undefined),
    switches?.getSnapshot ?? (() => undefined),
    switches?.getSnapshot ?? (() => undefined),
  )
  // No store means an older caller, which renders everything.
  if (switches !== undefined && snapshot !== undefined && !partEnabled(snapshot, 'migration')) return null
  return createElement(LegacyMigrationModal, { settings, t })
}

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

export function apply(context: ClientContext, switches?: ComponentSwitchStore): void {
  // The store is read per render rather than snapshotted here: a row toggled in
  // the plugin page must reach the panel without a page refresh, and a slot
  // registers once. `undefined` means an older caller, which renders everything.
  const slots = context.get('slots') as ClientSlots | undefined
  if (slots === undefined) return
  const connection = context.get('connection') as import('@hytime/dsh-plugin-kit').ClientConnection | undefined
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
      () => createElement(SectionEditor, { settings: observedSettings, locale, t: translate, takeoverRuntime: runtime, ...(switches === undefined ? {} : { switches }) }),
    ))

    // The migration dialog is its own Loader row: with `thinking-effort-migration`
    // off there is no host watcher to offer anything. The slot is still
    // registered so a row re-enabled while the page is open starts offering
    // again; the component returns null while the row is off.
    slots.inject(OVERLAY_NAME, () => slots.register(
      { name: OVERLAY_NAME, id: OVERLAY_ID, order: OVERLAY_ORDER },
      () => createElement(MigrationOverlayGate, { settings: observedSettings, t: translate, switches }),
    ))
  }

  const mountFromRemote = (): void => {
    mount(settingsBridge(connection, context.get('remote.settings'), locale.addLanguage, configFormsView(context)))
  }
  mountFromRemote()
  context.on('internal/service', (serviceName) => {
    if (serviceName === 'remote.settings' || serviceName === 'remote' || serviceName === 'configForms') mountFromRemote()
  })
}
