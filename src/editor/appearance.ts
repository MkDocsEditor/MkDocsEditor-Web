import { Facet, StateEffect, StateField } from '@codemirror/state'
import type { ChangeSet, EditorState, Extension, Transaction } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view'
import type { DecorationSet, PluginValue, ViewUpdate } from '@codemirror/view'

/**
 * Text that others write fades in (agent-presence.md, section 3 "Client animation"). Only the
 * newest characters of each writer fade, and only text the app marks with `animateText`: never
 * what the person types, pastes, undoes or redoes here. Off by default.
 */
export interface AppearanceConfig {
  enabled: boolean
  /** How long a character takes to fade in. */
  fadeMs: number
  /** How many of the newest characters of a writer fade; older ones show at once. */
  window: number
  /** At most this many ranges fade at the same time; the oldest show at once. */
  maxRanges: number
}

export const DEFAULT_APPEARANCE: AppearanceConfig = {
  enabled: false,
  fadeMs: 250,
  window: 16,
  maxRanges: 24,
}

/** Text that `tag` (a writer) inserted, in the document after the transaction's changes. */
export interface TaggedRange {
  tag: string
  from: number
  to: number
}

interface Appearing extends TaggedRange {
  /** When the fade started, on the clock of `document.timeline`. */
  start: number
  id: number
}

/** Lets text fade in: add it in the transaction that inserts it. */
export const animateText = StateEffect.define<readonly TaggedRange[]>({
  map: (ranges, mapping) =>
    ranges
      .map((r) => ({ ...r, from: mapping.mapPos(r.from, 1), to: mapping.mapPos(r.to, -1) }))
      .filter((r) => r.to > r.from),
})

/** Shows the text of a writer at once (ends its fades). */
export const finishAnimation = StateEffect.define<string>()

/** Removes the fades that ended by this time. */
const expireAnimations = StateEffect.define<number>()

const appearanceConfig = Facet.define<Partial<AppearanceConfig>, AppearanceConfig>({
  combine: (values) => Object.assign({}, DEFAULT_APPEARANCE, ...values) as AppearanceConfig,
})

/** The system asks for less motion: nothing fades. */
export function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
}

/** Whether text that others write fades in this editor now: worth finding out what they wrote. */
export function fadesText(state: EditorState): boolean {
  return state.facet(appearanceConfig).enabled && !reducedMotion()
}

/** The clock of `document.timeline`, which Web Animations start times use. */
const now = () => performance.now()

let nextId = 1

/** Keeps the newest `window` characters of each writer, and the newest `maxRanges` ranges. */
function trim(ranges: readonly Appearing[], config: AppearanceConfig): Appearing[] {
  const left = new Map<string, number>()
  const kept: Appearing[] = []
  for (let i = ranges.length - 1; i >= 0 && kept.length < config.maxRanges; i--) {
    const range = ranges[i]!
    const room = left.get(range.tag) ?? config.window
    if (room <= 0) continue
    const from = Math.max(range.from, range.to - room)
    left.set(range.tag, room - (range.to - from))
    kept.push(from === range.from ? range : { ...range, from })
  }
  return kept.reverse()
}

/**
 * Maps ranges through changes. Text inserted inside a range is not part of it: the range is
 * split around it (else what the person types into fading text would fade too).
 */
function mapRanges(ranges: readonly Appearing[], changes: ChangeSet): Appearing[] {
  const inserted: [number, number][] = []
  changes.iterChanges((_fromA, _toA, fromB, toB) => {
    if (toB > fromB) inserted.push([fromB, toB])
  })
  const mapped: Appearing[] = []
  for (const range of ranges) {
    let from = changes.mapPos(range.from, 1)
    const to = changes.mapPos(range.to, -1)
    for (const [insFrom, insTo] of inserted) {
      if (insTo <= from || insFrom >= to) continue
      if (insFrom > from) mapped.push({ ...range, from, to: insFrom })
      from = Math.max(from, insTo)
    }
    if (to > from) mapped.push({ ...range, from, to })
  }
  return mapped
}

function update(ranges: readonly Appearing[], tr: Transaction): readonly Appearing[] {
  let next = ranges
  if (tr.docChanged && next.length > 0) next = mapRanges(next, tr.changes)
  const config = tr.state.facet(appearanceConfig)
  let added = false
  for (const effect of tr.effects) {
    if (effect.is(animateText)) {
      if (!config.enabled || reducedMotion()) continue
      const start = now()
      const length = tr.state.doc.length
      for (const range of effect.value) {
        const from = Math.max(0, Math.min(length, range.from))
        const to = Math.max(0, Math.min(length, range.to))
        if (to > from) next = [...next, { tag: range.tag, from, to, start, id: nextId++ }]
      }
      added = true
    } else if (effect.is(finishAnimation)) {
      next = next.filter((r) => r.tag !== effect.value)
    } else if (effect.is(expireAnimations)) {
      next = next.filter((r) => r.start + config.fadeMs > effect.value)
    }
  }
  if (!config.enabled && next.length > 0) return []
  return added ? trim(next, config) : next
}

const appearing = StateField.define<readonly Appearing[]>({
  create: () => [],
  update,
  provide: (field) =>
    EditorView.decorations.from(field, (ranges): DecorationSet =>
      Decoration.set(
        ranges.map((r) =>
          Decoration.mark({
            class: 'cm-appear',
            attributes: { 'data-appear': String(r.id) },
          }).range(r.from, r.to),
        ),
        true,
      ),
    ),
})

/**
 * Runs the fades as Web Animations. CodeMirror draws a line again when its decorations change,
 * which would restart a CSS animation; a new span gets an animation with the start time of its
 * range instead, so it goes on where the old one was. Only the drawn lines are looked at.
 */
const animator = ViewPlugin.fromClass(
  class implements PluginValue {
    private readonly started = new WeakSet<Element>()
    private timer: ReturnType<typeof setTimeout> | null = null

    constructor(private readonly view: EditorView) {
      this.schedule()
    }

    update(update: ViewUpdate): void {
      if (update.startState.field(appearing) !== update.state.field(appearing)) this.schedule()
      // any update can draw a line again (other decorations too): its new spans need the fade
      else if (update.state.field(appearing).length > 0) this.requestAnimate()
    }

    private requestAnimate(): void {
      this.view.requestMeasure({ key: this, read: () => null, write: () => this.animate() })
    }

    private schedule(): void {
      const ranges = this.view.state.field(appearing)
      if (this.timer) clearTimeout(this.timer)
      this.timer = null
      if (ranges.length === 0) return
      this.requestAnimate()
      const { fadeMs } = this.view.state.facet(appearanceConfig)
      const end = Math.min(...ranges.map((r) => r.start + fadeMs))
      this.timer = setTimeout(
        () => {
          this.timer = null
          this.view.dispatch({ effects: expireAnimations.of(now()) })
        },
        Math.max(0, end - now()) + 16,
      )
    }

    private animate(): void {
      const ranges = this.view.state.field(appearing)
      const starts = new Map(ranges.map((r) => [String(r.id), r.start]))
      const { fadeMs } = this.view.state.facet(appearanceConfig)
      for (const span of this.view.contentDOM.querySelectorAll<HTMLElement>('[data-appear]')) {
        if (this.started.has(span) || typeof span.animate !== 'function') continue
        const start = starts.get(span.dataset.appear ?? '')
        if (start === undefined) continue
        this.started.add(span)
        const animation = span.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: fadeMs,
          easing: 'ease-out',
          fill: 'backwards',
        })
        animation.startTime = start
      }
    }

    destroy(): void {
      if (this.timer) clearTimeout(this.timer)
    }
  },
)

/** Fading in text others write; `animateText` marks what fades. */
export function appearance(config: Partial<AppearanceConfig> = {}): Extension {
  return [appearanceConfig.of(config), appearing, animator]
}

/** The ranges that fade right now, for tests. */
export function appearingRanges(state: EditorView['state']): readonly TaggedRange[] {
  return state.field(appearing, false)?.map(({ tag, from, to }) => ({ tag, from, to })) ?? []
}
