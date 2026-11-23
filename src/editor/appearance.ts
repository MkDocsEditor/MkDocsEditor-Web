import { Facet, Prec, StateEffect, StateField } from '@codemirror/state'
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
  /** How fast a live agent change is typed out, at least. */
  revealCharsPerSecond: number
  /** A reveal takes at most this long: longer text is typed faster. */
  revealMaxMs: number
  /** Live agent changes with more text than this show at once. */
  revealMaxChars: number
}

export const DEFAULT_APPEARANCE: AppearanceConfig = {
  enabled: false,
  fadeMs: 250,
  window: 16,
  maxRanges: 24,
  revealCharsPerSecond: 60,
  revealMaxMs: 4_000,
  revealMaxChars: 2_048,
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
  return [appearanceConfig.of(config), appearing, animator, revealing, revealer, revealTheme]
}

/*
 * The typing reveal of live agent changes (agent-presence.md section 3, "Client animation"):
 * the text is in the document at once, and a decoration hides what is not typed yet, keeping
 * its space. The ranges of one agent are typed out in the order of its edits.
 */

interface Revealing {
  tag: string
  from: number
  /** Where the hidden part starts: the head of the reveal. */
  hiddenFrom: number
  to: number
  /** Characters per second, set when the reveal starts. */
  rate: number
}

/** Reveals text of a live agent change; add it in the transaction that inserts it. */
export const revealText = StateEffect.define<readonly TaggedRange[]>({
  map: (ranges, mapping) =>
    ranges
      .map((r) => ({ ...r, from: mapping.mapPos(r.from, 1), to: mapping.mapPos(r.to, -1) }))
      .filter((r) => r.to > r.from),
})

/** Shows the rest of an agent's reveal at once. */
export const finishReveal = StateEffect.define<string>()

/** Uncovers the next characters of an agent's reveal. */
const advanceReveal = StateEffect.define<{ tag: string; chars: number }>()

/**
 * Whether a live agent change of this size is typed out here: the setting is on, motion is not
 * reduced, the page is visible, and the text is not too long. Else it shows at once.
 */
export function revealsText(state: EditorState, chars: number): boolean {
  const config = state.facet(appearanceConfig)
  return (
    fadesText(state) &&
    chars <= config.revealMaxChars &&
    (typeof document === 'undefined' || document.visibilityState !== 'hidden')
  )
}

/** Maps the reveals; one whose hidden text a change touches (inside or at an edge) is finished. */
function mapReveals(ranges: readonly Revealing[], changes: ChangeSet): Revealing[] {
  const touched: [number, number][] = []
  changes.iterChangedRanges((fromA, toA) => touched.push([fromA, toA]))
  const mapped: Revealing[] = []
  for (const range of ranges) {
    // nobody types into invisible text
    if (touched.some(([from, to]) => from <= range.to && to >= range.hiddenFrom)) continue
    const from = changes.mapPos(range.from, 1)
    const to = changes.mapPos(range.to, -1)
    const hiddenFrom = changes.mapPos(range.hiddenFrom, -1)
    if (to > hiddenFrom) mapped.push({ ...range, from: Math.min(from, hiddenFrom), hiddenFrom, to })
  }
  return mapped
}

/** Uncovers `chars` characters of a tag's ranges, in their order. */
function advance(ranges: readonly Revealing[], tag: string, chars: number): Revealing[] {
  let left = chars
  const next: Revealing[] = []
  for (const range of ranges) {
    if (range.tag !== tag || left <= 0) {
      next.push(range)
      continue
    }
    const hidden = range.to - range.hiddenFrom
    if (hidden <= left) {
      left -= hidden
      continue // done
    }
    next.push({ ...range, hiddenFrom: range.hiddenFrom + left })
    left = 0
  }
  return next
}

const revealing = StateField.define<readonly Revealing[]>({
  create: () => [],
  update(value, tr) {
    let next = tr.docChanged && value.length > 0 ? mapReveals(value, tr.changes) : value
    const config = tr.state.facet(appearanceConfig)
    for (const effect of tr.effects) {
      if (effect.is(revealText)) {
        if (!fadesText(tr.state)) continue
        const tags = new Set(effect.value.map((r) => r.tag))
        // a new change of the same agent finishes its running reveal first
        next = next.filter((r) => !tags.has(r.tag))
        for (const tag of tags) {
          const ranges = effect.value.filter((r) => r.tag === tag)
          const chars = ranges.reduce((sum, r) => sum + r.to - r.from, 0)
          const rate = Math.max(config.revealCharsPerSecond, (chars * 1000) / config.revealMaxMs)
          for (const r of ranges)
            next = [...next, { tag, from: r.from, hiddenFrom: r.from, to: r.to, rate }]
        }
      } else if (effect.is(finishReveal)) {
        next = next.filter((r) => r.tag !== effect.value)
      } else if (effect.is(advanceReveal)) {
        next = advance(next, effect.value.tag, effect.value.chars)
      }
    }
    if (!config.enabled && next.length > 0) return []
    return next
  },
  provide: (field) =>
    // on top of every other decoration: authorship, search hits and cursors stay hidden too
    Prec.highest(
      EditorView.decorations.from(field, (ranges): DecorationSet =>
        Decoration.set(
          ranges.map((r) => Decoration.mark({ class: 'cm-unrevealed' }).range(r.hiddenFrom, r.to)),
          true,
        ),
      ),
    ),
})

/** Where each agent's reveal is now (by tag): its cursor is drawn there and followed. */
export function revealHeads(state: EditorState): Map<string, number> {
  const heads = new Map<string, number>()
  for (const range of state.field(revealing, false) ?? []) {
    if (!heads.has(range.tag)) heads.set(range.tag, range.hiddenFrom)
  }
  return heads
}

/** The text that reveals hide right now, for tests. */
export function hiddenRanges(state: EditorState): readonly TaggedRange[] {
  return (state.field(revealing, false) ?? []).map((r) => ({
    tag: r.tag,
    from: r.hiddenFrom,
    to: r.to,
  }))
}

/** How often the reveal moves on. */
const REVEAL_STEP_MS = 30

/** Types the reveals out, and lets a click on the text being revealed show it at once. */
const revealer = ViewPlugin.fromClass(
  class implements PluginValue {
    private timer: ReturnType<typeof setTimeout> | null = null
    private last = 0
    /** Fractions of characters carried over to the next step, by tag. */
    private readonly carry = new Map<string, number>()

    constructor(private readonly view: EditorView) {
      this.schedule()
    }

    update(update: ViewUpdate): void {
      if (update.startState.field(revealing) !== update.state.field(revealing)) this.schedule()
    }

    private schedule(): void {
      const ranges = this.view.state.field(revealing)
      if (ranges.length === 0) {
        if (this.timer) clearTimeout(this.timer)
        this.timer = null
        this.carry.clear()
        return
      }
      if (this.timer) return
      this.last = now()
      this.timer = setTimeout(() => this.step(), REVEAL_STEP_MS)
    }

    private step(): void {
      this.timer = null
      const ranges = this.view.state.field(revealing)
      const elapsed = now() - this.last
      const effects: StateEffect<unknown>[] = []
      for (const tag of new Set(ranges.map((r) => r.tag))) {
        const head = ranges.find((r) => r.tag === tag)!
        const exact = (this.carry.get(tag) ?? 0) + (head.rate * elapsed) / 1000
        const chars = Math.floor(exact)
        this.carry.set(tag, exact - chars)
        if (chars === 0) continue
        effects.push(advanceReveal.of({ tag, chars }))
        // what is uncovered fades in, like the text of others
        effects.push(animateText.of(uncovered(ranges, tag, chars)))
      }
      if (effects.length > 0) this.view.dispatch({ effects })
      this.schedule()
    }

    destroy(): void {
      if (this.timer) clearTimeout(this.timer)
    }
  },
  {
    eventHandlers: {
      mousedown(event, view) {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }, false)
        // the range being revealed right now, of each agent
        const heads = new Map<string, Revealing>()
        for (const r of view.state.field(revealing)) if (!heads.has(r.tag)) heads.set(r.tag, r)
        for (const [tag, range] of heads) {
          if (pos >= range.from && pos <= range.to) view.dispatch({ effects: finishReveal.of(tag) })
        }
        return false
      },
    },
  },
)

/** The ranges the next `chars` characters of a tag's reveal uncover. */
function uncovered(ranges: readonly Revealing[], tag: string, chars: number): TaggedRange[] {
  let left = chars
  const result: TaggedRange[] = []
  for (const range of ranges) {
    if (range.tag !== tag || left <= 0) continue
    const to = Math.min(range.to, range.hiddenFrom + left)
    result.push({ tag, from: range.hiddenFrom, to })
    left -= to - range.hiddenFrom
  }
  return result
}

/** Hidden text keeps its space: transparent, and so is everything drawn in it. */
const revealTheme = EditorView.baseTheme({
  '.cm-unrevealed': {
    color: 'transparent !important',
    backgroundColor: 'transparent !important',
    textDecorationColor: 'transparent !important',
  },
  '.cm-unrevealed *': { visibility: 'hidden' },
})

/** The ranges that fade right now, for tests. */
export function appearingRanges(state: EditorView['state']): readonly TaggedRange[] {
  return state.field(appearing, false)?.map(({ tag, from, to }) => ({ tag, from, to })) ?? []
}
