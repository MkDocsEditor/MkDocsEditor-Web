/**
 * The timing of a typing step (R5b and R5c of KodeEditor's docs/reveal.md), for the caret of
 * somebody who types (`cursorGlide`) and the space their keys grow or close (`appearance`) alike.
 *
 * Fast keys glide at an even speed over 1.5 times the time between them (smoothed), so the caret
 * keeps moving between the keys. Slow keys take short ease-out steps of `CRISP_MS`, as standing
 * still between them is right then. In between the two blend: `crisp` goes from 0 at
 * `EVEN_BELOW_MS` between the keys to 1 at `CRISP_ABOVE_MS`.
 */
export const TYPING_CHARS = 3
export const TYPING_WITHIN_MS = 250
export const MIN_TYPING_MS = 32
/** How much of a new time between the keys goes into the smoothed one. */
export const TYPING_SMOOTHING = 0.3
export const EVEN_BELOW_MS = 100
export const CRISP_ABOVE_MS = 200
export const CRISP_MS = 100
/** One frame, by which an even step starts earlier: it moves in the frame it is drawn first. */
const FRAME_MS = 16

/** The smoothed time between the keys after a key `since` ms after the one before. */
export function smoothInterval(before: number | undefined, since: number): number {
  return before === undefined ? since : before + TYPING_SMOOTHING * (since - before)
}

/** How a step with `interval` between the keys moves: how long, how crisp, how early it starts. */
export function typingStep(interval: number): { duration: number; crisp: number; early: number } {
  const crisp = Math.min(
    1,
    Math.max(0, (interval - EVEN_BELOW_MS) / (CRISP_ABOVE_MS - EVEN_BELOW_MS)),
  )
  const even = Math.min(TYPING_WITHIN_MS, Math.max(MIN_TYPING_MS, 1.5 * interval))
  // the ease-out moves in its first frame anyway
  return { duration: even + (CRISP_MS - even) * crisp, crisp, early: FRAME_MS * (1 - crisp) }
}

/** How far a step is at `t` from 0 to 1: even, the ease-out cubic, or a blend of both. */
export function typingWay(t: number, crisp: number): number {
  return t + (1 - (1 - t) ** 3 - t) * crisp
}

/** Its speed at `t`, in the way per `t`. */
export function typingSpeed(t: number, crisp: number): number {
  return 1 + (3 * (1 - t) ** 2 - 1) * crisp
}

/** The easing of `typingWay` for Web Animations: CSS `linear()` through points of the curve. */
export function typingEasing(crisp: number): string {
  if (crisp <= 0) return 'linear'
  const points = Array.from({ length: 21 }, (_, i) => typingWay(i / 20, crisp).toFixed(4))
  return `linear(${points.join(', ')})`
}
