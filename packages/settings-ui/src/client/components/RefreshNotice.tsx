/**
 * The hint that a component switch needs a page refresh to reach the UI.
 *
 * A row toggled in the plugin page writes `cordis.patch.yml` and reloads that
 * row in the Host. The browser bundle, however, is ONE artifact for all seven
 * rows and it was fetched for the page that is already open, so the panel keeps
 * rendering whichever components it was built with. The user therefore sees the
 * toggle succeed in the plugin page and no change in Settings, with no
 * explanation.
 *
 * This notice explains it. It is STATIC on purpose: an earlier version tried to
 * detect the change and react to it live, which required the Host to announce
 * row toggles through a settings write. That write was itself a profile change,
 * so it re-triggered the Loader update the announcement listened to, and the
 * resulting write storm grew the counter into the hundreds and left the plugin
 * manager stuck mid-operation. Reading a switch once per page load is the safe
 * shape: the Host applies the switch on the next start either way, so a refresh
 * is all the client can honestly ask for.
 *
 * @module @hytime/dsh-feature-settings-ui/refresh-notice
 */
import React from 'react'
import type { Translation } from '@hytime/dsh-plugin-kit'
import type { Palette } from '../theme.js'

export interface RefreshNoticeProps {
  readonly palette: Palette
  readonly t: Translation
}

/**
 * Render the refresh hint.
 *
 * @param props - the palette and translator.
 * @returns the notice.
 */
export function RefreshNotice({ palette, t }: RefreshNoticeProps): React.ReactElement {
  return (
    <div
      role="status"
      data-scope="component-switch-refresh"
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
      <span>{t('componentSwitchRefreshRequired')}</span>
    </div>
  )
}
