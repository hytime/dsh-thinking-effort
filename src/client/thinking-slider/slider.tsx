/**
 * Composer model seat placeholder (Task 1 skeleton). Renders a route-guard
 * debug text so the `conversation.input.model` registration visibly occupies
 * the seat. Task 2 wires the shared model directory and replaces this guard
 * with the real slider UI.
 */
import { createElement } from 'react'
import type { ReactNode } from 'react'
import type { Translation } from '../types.js'
import css from './slider.module.css'

/** Debug dictionary key for the route guard; real copy lands with Task 2. */
export const SLIDER_PLACEHOLDER_KEY = 'thinkingSliderPlaceholder'

/** Adapter-owned directory store surface (wired in Task 2). */
export interface SliderDirectory {
  getSnapshot(): unknown
}

export interface SliderProps {
  /** Shared model-directory store; the skeleton accepts it, Task 2 consumes it. */
  readonly directory?: SliderDirectory
  /** Bound locale translate (LOCALE_NS). */
  readonly t: Translation
}

/** Presentational slider shell: renders the route-guard placeholder text. */
export function Slider({ directory: _directory, t }: SliderProps): ReactNode {
  return createElement(
    'div',
    { className: css.root },
    t(SLIDER_PLACEHOLDER_KEY),
  )
}