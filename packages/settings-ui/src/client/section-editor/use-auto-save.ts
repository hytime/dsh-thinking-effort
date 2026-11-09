import React from 'react'

/**
 * How long typing has to pause before the panel writes.
 *
 * A per-keystroke write would send one mutation per character, and each one
 * fences the next: the field would flicker through refusals while the user is
 * still mid-number. A short idle window instead batches a typed value into one
 * write, which is what makes "no Save button" honest rather than chatty.
 */
export const AUTO_SAVE_IDLE_MS = 600

/** What one auto-saved draft looks like to the hook: the value plus whether it is still editable. */
export interface AutoSaveDraft {
  /** The editable text exactly as the user typed it. */
  readonly text: string
  /**
   * Whether this text is safe to write. An invalid draft stays in the field and
   * reports its reason; it is never sent, because a rejected write would roll
   * the user's typing back under them.
   */
  readonly writable: boolean
  /** A value that was never edited, so the mount-time state is already stored. */
  readonly touched: boolean
}

/**
 * Persist a draft once typing pauses, instead of on a Save button.
 *
 * The hook owns only the timing and the "one write per settled value" rule; it
 * knows nothing about settings, ops or revisions, so the same call serves the
 * per-model compaction ratios and the subagent route picker.
 *
 * Three cases deliberately do NOT write:
 *
 * - an untouched draft, because nothing changed;
 * - an unwritable one, because the field is mid-edit or invalid;
 * - a value identical to the last one written, which is what stops the reload
 *   that follows a successful write from triggering another one.
 *
 * `save` is read through a ref so a caller can pass an inline closure without
 * restarting the timer on every render, which would otherwise postpone the
 * write until the user stopped typing *and* the parent stopped re-rendering.
 *
 * @param draft - the current editable value and whether it may be written.
 * @param save - called with the settled text; performs the actual write.
 * @returns nothing; the caller keeps rendering from its own state.
 */
export function useAutoSave(draft: AutoSaveDraft, save: (text: string) => void): void {
  const saveRef = React.useRef(save)
  saveRef.current = save
  // The last value this hook wrote or observed as already stored. A reload
  // replaces the draft with the stored value; without this the effect would
  // read that as a fresh edit and write it straight back.
  const settled = React.useRef<string | undefined>(undefined)
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  React.useEffect(() => {
    if (!draft.touched) {
      // The mount-time value IS the stored one, so record it as the baseline.
      settled.current = draft.text
      return undefined
    }
    if (!draft.writable) return undefined
    if (draft.text === settled.current) return undefined
    if (timer.current !== undefined) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      timer.current = undefined
      if (draft.text === settled.current) return
      settled.current = draft.text
      saveRef.current(draft.text)
    }, AUTO_SAVE_IDLE_MS)
    return () => {
      if (timer.current !== undefined) {
        clearTimeout(timer.current)
        timer.current = undefined
      }
    }
  }, [draft.text, draft.writable, draft.touched])
}
