/**
 * The "restart DSH" notice for a component switch that just changed.
 *
 * The panel follows a row toggle immediately — that is what the switch store is
 * for — but the toggle only takes effect when the Loader is next started. Without
 * a notice the user sees a card disappear and reasonably concludes the feature is
 * off, while the host half is still mounted and still acting on requests.
 *
 * The notice is deliberately not a permanent banner: it appears only once the
 * store's answer has CHANGED, so ordinary startup is silent and so is a host that
 * cannot report its inventory at all.
 *
 * @module @hytime/dsh-feature-settings-ui/restart-notice
 */
import React from 'react'
import { useSyncExternalStore } from 'react'
import type { ComponentKey, ComponentSwitchState, ComponentSwitchStore, Translation } from '@hytime/dsh-plugin-kit'
import type { Palette } from '../theme.js'

/**
 * Stable fallbacks so a mount without a store does not resubscribe per render.
 *
 * `useSyncExternalStore` compares both callbacks by identity, so inline closures
 * would tear the subscription down and rebuild it on every render.
 */
const NO_SUBSCRIBE = (): (() => void) => () => undefined
const NO_SNAPSHOT = (): Record<ComponentKey, ComponentSwitchState> | undefined => undefined
const NO_VERSION = (): number => 0

export interface RestartNoticeProps {
  readonly switches?: ComponentSwitchStore
  readonly palette: Palette
  readonly t: Translation
}

/**
 * Render the restart hint once a component switch has moved.
 *
 * @param props - the switch store plus the palette and translator.
 * @returns the notice, or `null` while nothing has changed.
 */
export function RestartNotice({ switches, palette, t }: RestartNoticeProps): React.ReactElement | null {
  const version = useSyncExternalStore(
    switches?.subscribe ?? NO_SUBSCRIBE,
    switches?.getVersion ?? NO_VERSION,
    switches?.getVersion ?? NO_VERSION,
  )
  // A store-less mount is an older caller: it also rendered every part, so it
  // has no switch change to announce.
  if (switches === undefined || version === 0) return null
  return (
    <div
      role="status"
      aria-live="polite"
      data-scope="component-switch-restart"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '6px',
        margin: '0 0 8px',
        padding: '6px 8px',
        border: `1px solid ${palette.accentBorder}`,
        borderRadius: '8px',
        color: palette.accent,
        backgroundColor: palette.accentSoft,
        fontSize: '12px',
        lineHeight: '18px',
        fontWeight: 650,
      }}
    >
      <span>{t('componentSwitchRestartRequired')}</span>
    </div>
  )
}
