/**
 * Thinking-effort composer model seat (`conversation.input.model`), Task 1
 * skeleton. Registers the seat with a route-guard placeholder component;
 * Task 2 wires the shared model directory into the injected face.
 */
import { createElement } from 'react'
import { LOCALE_NS } from '../constants.js'
import type { ClientContext, ClientLocale, ClientSlots } from '../types.js'
import { Slider } from './slider.js'

export { Slider } from './slider.js'
export type { SliderDirectory, SliderProps } from './slider.js'

/** Target slot key of the composer model seat. */
export const SEAT_NAME = 'conversation.input.model'
/** Shadowing priority: the placeholder yields to any real occupant. */
export const SEAT_PRIORITY = -10

/**
 * Register the composer model seat over a Cordis-style client context.
 * Task 2 extends the closure with the shared model directory.
 * @param context - client root context (slots + locale).
 */
export function apply(context: ClientContext): void {
  const slots = context.get('slots') as ClientSlots | undefined
  if (slots === undefined) return
  const locale = context.get('locale') as ClientLocale
  const translate = locale.bind(LOCALE_NS)
  slots.inject(SEAT_NAME, () => slots.register(
    {
      name: SEAT_NAME,
      priority: SEAT_PRIORITY,
      locale: LOCALE_NS,
    },
    () => createElement(Slider, { t: translate }),
  ))
}