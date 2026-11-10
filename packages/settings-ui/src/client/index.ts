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

export interface SettingsApplyOptions {
  /** Whether each of the bundle's other components is switched on, read per render. */
  readonly switches?: ComponentSwitchStore
  /**
   * Re-read the component switches and remount these surfaces.
   *
   * The panel cannot read the switches itself — that dependency belongs to the
   * plugin entry — and a slot cannot be unregistered except through the disposer
   * `register` returns. So the entry hands this in, and the panel drops its
   * registrations before letting the entry mount again.
   *
   * Absent for an older caller, which then has no reload affordance.
   */
  readonly refresh?: () => Promise<ComponentSwitchStore | undefined>
}

export function apply(context: ClientContext, options: SettingsApplyOptions = {}): void {
  const { switches } = options
  /**
   * Drops the current slot registrations.
   *
   * Assigned once the panel mounts; a refresh calls it before re-reading the
   * switches so a surface whose row was just switched off loses its navigation
   * entry instead of opening an empty page.
   */
  let disposeSurfaces: (() => void) | undefined
  /**
   * The refresh the mounted panel calls, if the entry supplied one.
   *
   * Read by `mount` when it builds the slot callback — which happens BEFORE this
   * is assigned, so the callback must read it lazily (it does, inside the render
   * closure) rather than destructure it at creation time.
   */
  let refreshHook: (() => Promise<void>) | undefined
  // The store is read per render rather than snapshotted here: a row toggled in
  // the plugin page must reach the panel without a page refresh, and a slot
  // registers once. `undefined` means an older caller, which renders everything.
  const slots = context.get('slots') as ClientSlots | undefined
  if (slots === undefined) return
  const connection = context.get('connection') as import('@hytime/dsh-plugin-kit').ClientConnection | undefined
  const locale = context.get('locale') as ClientLocale
  let mounted = false

  const mount = (settings: ReturnType<typeof settingsBridge>, store = switches): void => {
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

    // Registered through a disposable scope rather than directly: a refresh
    // re-reads the switches, and whether the panel exists at all is one of the
    // things that can change. A slot cannot be unregistered any other way.
    disposeSurfaces = () => {
      const disposers = [
        slots.inject(SLOT_NAME, () => slots.register(
          {
            name: SLOT_NAME,
            id: SLOT_ID,
            order: SLOT_ORDER,
            locale: LOCALE_NS,
            label: () => translate('pageTitle'),
          },
          () => createElement(SectionEditor, { settings: observedSettings, locale, t: translate, takeoverRuntime: runtime, switches: store, onRefresh: refreshHook }),
        )),
        // The migration dialog is its own Loader row: with `thinking-effort-migration`
        // off there is no host watcher to offer anything. Its slot stays registered
        // so a row re-enabled while the page is open starts offering again; the
        // component returns null while the row is off.
        slots.inject(OVERLAY_NAME, () => slots.register(
          { name: OVERLAY_NAME, id: OVERLAY_ID, order: OVERLAY_ORDER },
          () => createElement(MigrationOverlayGate, { settings: observedSettings, t: translate, switches: store }),
        )),
      ]
      return () => { for (const dispose of disposers.reverse()) dispose() }
    }
    disposeSurfaces()
  }

  const mountFromRemote = (): void => {
    mount(settingsBridge(connection, context.get('remote.settings'), locale.addLanguage, configFormsView(context)))
  }
  mountFromRemote()
  context.on('internal/service', (serviceName) => {
    if (serviceName === 'remote.settings' || serviceName === 'remote' || serviceName === 'configForms') mountFromRemote()
  })

  /**
   * Re-read the switches and remount these surfaces.
   *
   * Whether a surface exists is decided at mount, and a slot cannot be
   * unregistered except through its disposer — so the order is: drop what this
   * panel registered, ask the entry for a fresh answer, then mount again. A
   * component switched off in the meantime loses its navigation entry; one
   * switched on gains it.
   *
   * The answer comes back as a NEW store, and `mount` is re-entered with it: the
   * slot callbacks captured the previous one, so assigning the outer binding
   * would leave the remounted editor reading the old map.
   */
  /**
   * Re-read the switches and remount these surfaces.
   *
   * Declared as a function so it is hoisted: `mount` runs during `apply` and its
   * slot callback captures this binding, so a `const` assigned afterwards would
   * leave every rendered panel with `undefined` — the button then does nothing.
   *
   * The order is: drop what this panel registered, ask the entry for a fresh
   * answer, then mount again with it. A slot cannot be unregistered except
   * through its disposer, and the remounted surfaces must read the NEW store —
   * the previous one still holds the old map.
   */
  async function refreshSwitches(): Promise<void> {
    if (options.refresh === undefined) return
    // Read FIRST, then swap. Tearing the slot down unmounts the very component
    // whose click handler is running, and that unmount cancels the rest of this
    // async chain — which is why the button appeared to do nothing.
    const next = await options.refresh()
    disposeSurfaces?.()
    disposeSurfaces = undefined
    mounted = false
    const bridge = settingsBridge(connection, context.get('remote.settings'), locale.addLanguage, configFormsView(context))
    mount(bridge, next)
  }

  // Passed to every mount, so the panel always holds the real hook.
  refreshHook = options.refresh === undefined ? undefined : refreshSwitches
}
