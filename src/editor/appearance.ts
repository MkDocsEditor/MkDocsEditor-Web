import { Annotation, Facet, Prec, StateEffect, StateField } from '@codemirror/state'
import type { ChangeSet, EditorState, Extension, Transaction } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, WidgetType } from '@codemirror/view'
import type { DecorationSet, PluginValue, ViewUpdate } from '@codemirror/view'

import {
  TYPING_CHARS,
  TYPING_WITHIN_MS,
  smoothInterval,
  typingEasing,
  typingStep,
  typingWay,
} from './typingTiming'

/**
 * Text that others write fades in (agent-presence.md, section 3 "Client animation"). Only the
 * newest characters of each writer fade, and only text the app marks with `animateText`: never
 * what the person types, pastes, undoes or redoes here. Off by default.
 */
/** Marks transactions that come from the session: what others wrote, or a resync. */
export const remoteChange = Annotation.define<boolean>()

/**
 * Whether the person here changed the text: not the session, and not text marked to fade or to be
 * revealed (which only ever comes from others).
 */
export function isUserEdit(tr: Transaction): boolean {
  return (
    tr.docChanged &&
    !tr.annotation(remoteChange) &&
    !tr.effects.some((e) => e.is(animateText) || e.is(revealText))
  )
}

export interface AppearanceConfig {
  enabled: boolean
  /**
   * At most this many pieces fade at the same time: with more, the two pieces one behind the
   * other of a writer whose alphas are the closest become one (R4).
   */
  maxRanges: number
  /** How fast a live agent change is typed out, at least. */
  revealCharsPerSecond: number
  /** No character of a reveal waits longer than this to show: a backlog is typed faster. */
  revealMaxMs: number
  /** Live agent changes with more text than this show at once. */
  revealMaxChars: number
}

export const DEFAULT_APPEARANCE: AppearanceConfig = {
  enabled: false,
  maxRanges: 256,
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
  /** How long it fades in, from the rate of its writer when it came (R4). */
  duration: number
  /** A piece of a reveal: only a change of the person here ends its fade. */
  reveal?: boolean
}

const HIDDEN = 'mask-image: linear-gradient(transparent, transparent)'
/** Typed inserts up to this long fade a character each, like keys one after the other. */
const TYPED_CHARS = 3

/** Lets text fade in: add it in the transaction that inserts it. */
export const animateText = StateEffect.define<readonly TaggedRange[]>({
  map: (ranges, mapping) =>
    ranges
      .map((r) => ({ ...r, from: mapping.mapPos(r.from, 1), to: mapping.mapPos(r.to, -1) }))
      .filter((r) => r.to > r.from),
})

/** Lets the pieces of a reveal fade in, each in full. */
const revealPiece = StateEffect.define<readonly TaggedRange[]>({
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

/** How visible a piece is at `time`: the ease-out quadratic, fast at first (R4). */
export function pieceAlpha(start: number, time: number, duration: number): number {
  const p = Math.min(1, Math.max(0, (time - start) / duration))
  return 1 - (1 - p) ** 2
}

/** The fade of a piece is longer the faster its writer writes: typing short, a reveal longer. */
export const FADE_MIN_MS = 320
export const FADE_MAX_MS = 1_000
const SLOW_RATE = 10
const FAST_RATE = 120
/** How fast the rate of a writer forgets: characters per second, decaying with e^(-t / 1 s). */
const RATE_MEMORY_MS = 1_000

/** How long a piece fades in, for a writer at `rate` characters per second. */
export function fadeDuration(rate: number): number {
  const k = Math.min(1, Math.max(0, (rate - SLOW_RATE) / (FAST_RATE - SLOW_RATE)))
  return FADE_MIN_MS + (FADE_MAX_MS - FADE_MIN_MS) * k
}

/**
 * Keeps at most `maxRanges` pieces (R4): the two pieces one behind the other of the same writer
 * whose alphas are the closest become one, with the start of the more visible one; without such
 * neighbours, the most visible piece shows at once.
 */
function cap(ranges: readonly Appearing[], config: AppearanceConfig, time: number): Appearing[] {
  let next = [...ranges]
  const alpha = (r: Appearing) => pieceAlpha(r.start, time, r.duration)
  while (next.length > config.maxRanges) {
    let best: [number, number] | null = null
    let closest = Infinity
    for (let i = 0; i < next.length; i++) {
      const a = next[i]!
      for (let j = 0; j < next.length; j++) {
        const b = next[j]!
        if (i === j || a.tag !== b.tag || a.to !== b.from) continue
        const difference = Math.abs(alpha(a) - alpha(b))
        if (difference < closest) {
          closest = difference
          best = [i, j]
        }
      }
    }
    if (best) {
      const [a, b] = [next[best[0]]!, next[best[1]]!]
      const shown = alpha(a) >= alpha(b) ? a : b
      const merged = { ...shown, from: a.from, to: b.to, reveal: a.reveal || b.reveal }
      next = next.filter((_, k) => k !== best[0] && k !== best[1])
      next.push(merged)
    } else {
      const most = next.reduce((m, r) => (alpha(r) > alpha(m) ? r : m))
      next = next.filter((r) => r !== most)
    }
  }
  return next
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

interface AppearState {
  ranges: readonly Appearing[]
  /** The rate of each writer, characters per second, and when it was taken. */
  rates: ReadonlyMap<string, { rate: number; at: number }>
}

function update(value: AppearState, tr: Transaction): AppearState {
  const ranges = value.ranges
  let rates = value.rates
  let next = ranges
  if (tr.docChanged && next.length > 0) next = mapRanges(next, tr.changes)
  const config = tr.state.facet(appearanceConfig)
  let added = false
  // a reveal shown at once ends the fades of its writer; a change of the person, all of reveals
  const finished = finishedReveals(tr)
  if (finished === 'all' && next.some((r) => r.reveal)) next = next.filter((r) => !r.reveal)
  else if (finished !== 'all' && finished.size > 0) next = next.filter((r) => !finished.has(r.tag))
  const replaced = config.enabled && !reducedMotion() ? splitChunks(tr).replaces : []
  for (const effect of [
    ...tr.effects,
    ...(replaced.length > 0 ? [animateText.of(replaced)] : []),
  ]) {
    if (effect.is(animateText) || effect.is(revealPiece)) {
      if (!config.enabled || reducedMotion()) continue
      const start = now()
      const length = tr.state.doc.length
      const reveal = effect.is(revealPiece)
      // the rate of each writer with these characters, and the fade it gives them
      const durations = new Map<string, number>()
      for (const tag of new Set(effect.value.map((r) => r.tag))) {
        const chars = effect.value
          .filter((r) => r.tag === tag)
          .reduce((sum, r) => sum + Math.max(0, r.to - r.from), 0)
        const before = rates.get(tag)
        const rate =
          (before ? before.rate * Math.exp(-(start - before.at) / RATE_MEMORY_MS) : 0) + chars
        rates = new Map(rates).set(tag, { rate, at: start })
        durations.set(tag, fadeDuration(rate))
      }
      for (const range of effect.value) {
        const from = Math.max(0, Math.min(length, range.from))
        const to = Math.max(0, Math.min(length, range.to))
        // keys that came together are a piece each, as if one after the other: no edge inside
        const pieces =
          !reveal && to - from <= TYPED_CHARS
            ? Array.from({ length: to - from }, (_, k) => [from + k, from + k + 1] as const)
            : to > from
              ? [[from, to] as const]
              : []
        for (const [a, b] of pieces)
          next = [
            ...next,
            {
              tag: range.tag,
              from: a,
              to: b,
              start,
              duration: durations.get(range.tag)!,
              id: nextId++,
              ...(reveal ? { reveal } : {}),
            },
          ]
      }
      added = true
    } else if (effect.is(finishAnimation)) {
      next = next.filter((r) => r.tag !== effect.value)
    } else if (effect.is(expireAnimations)) {
      next = next.filter((r) => r.start + r.duration > effect.value)
    }
  }
  if (!config.enabled)
    return next.length > 0 || rates.size > 0 ? { ranges: [], rates: new Map() } : value
  if (added && next.length > config.maxRanges) next = cap(next, config, now())
  return next === ranges && rates === value.rates ? value : { ranges: next, rates }
}

const appearing = StateField.define<AppearState>({
  create: () => ({ ranges: [], rates: new Map() }),
  update,
  provide: (field) =>
    EditorView.decorations.from(field, ({ ranges }): DecorationSet =>
      Decoration.set(
        ranges.map((r) =>
          Decoration.mark({
            class: 'cm-appear',
            // invisible until the fade draws it, also when CodeMirror draws the span anew
            attributes: { 'data-appear': String(r.id), style: HIDDEN },
          }).range(r.from, r.to),
        ),
        true,
      ),
    ),
})

/**
 * Draws the fades (R4), in each frame while text fades: per character, not per piece. The alpha of
 * a character goes in a straight line from the middle of its piece to the middle of the piece one
 * behind or before it, so pieces one behind the other have no edges; the outer ends of a run keep
 * the alpha of their piece. Done with a mask over each span, one step per character.
 */
const animator = ViewPlugin.fromClass(
  class implements PluginValue {
    private timer: ReturnType<typeof setTimeout> | null = null
    private frame = 0

    constructor(private readonly view: EditorView) {
      this.schedule()
    }

    update(update: ViewUpdate): void {
      if (update.startState.field(appearing).ranges !== update.state.field(appearing).ranges)
        this.schedule()
      // any update can draw a line again (other decorations too): its new spans need the fade
      else if (update.state.field(appearing).ranges.length > 0) this.requestDraw()
    }

    private requestDraw(): void {
      this.view.requestMeasure({ key: this, read: () => null, write: () => this.draw() })
    }

    private schedule(): void {
      const { ranges } = this.view.state.field(appearing)
      if (this.timer) clearTimeout(this.timer)
      this.timer = null
      if (ranges.length === 0) {
        cancelAnimationFrame(this.frame)
        this.frame = 0
        return
      }
      this.requestDraw()
      const end = Math.min(...ranges.map((r) => r.start + r.duration))
      this.timer = setTimeout(
        () => {
          this.timer = null
          this.view.dispatch({ effects: expireAnimations.of(now()) })
        },
        Math.max(0, end - now()) + 16,
      )
    }

    /** Draws in every frame while text fades; draws asked for in between come on top. */
    private loop = (): void => {
      this.frame = 0
      this.draw()
    }

    private draw(): void {
      const { ranges } = this.view.state.field(appearing)
      if (ranges.length === 0) return
      const time = now()
      const pieces = ranges.map((r) => ({
        from: r.from,
        to: r.to,
        middle: (r.from + r.to) / 2,
        alpha: pieceAlpha(r.start, time, r.duration),
      }))
      const byId = new Map(ranges.map((r, i) => [String(r.id), pieces[i]!]))
      const before = new Map(pieces.map((p) => [p.from, p]))
      const after = new Map(pieces.map((p) => [p.to, p]))
      /** The alpha of the character whose middle is at `at`, in `piece`. */
      const alphaAt = (piece: (typeof pieces)[number], at: number) => {
        const other = at < piece.middle ? after.get(piece.from) : before.get(piece.to)
        if (!other || other === piece) return piece.alpha
        const k = (at - piece.middle) / (other.middle - piece.middle)
        return piece.alpha + (other.alpha - piece.alpha) * Math.min(1, Math.max(0, k))
      }
      for (const span of this.view.contentDOM.querySelectorAll<HTMLElement>('[data-appear]')) {
        const piece = byId.get(span.dataset.appear ?? '')
        if (!piece) continue
        const length = span.textContent?.length ?? 0
        // a span with all of its piece starts where the piece does; one split by other marks, ask
        let from = piece.from
        if (length !== piece.to - piece.from)
          try {
            from = this.view.posAtDOM(span, 0)
          } catch {
            continue
          }
        span.style.maskImage = mask(length, (k) => alphaAt(piece, from + k + 0.5))
      }
      if (!this.frame && ranges.some((r) => r.start + r.duration > time))
        this.frame = requestAnimationFrame(this.loop)
    }

    destroy(): void {
      if (this.timer) clearTimeout(this.timer)
      cancelAnimationFrame(this.frame)
    }
  },
)

/** A mask from left to right with the alpha of each of `length` characters, at most 64 steps. */
function mask(length: number, alpha: (k: number) => number): string {
  const steps = Math.max(1, Math.min(64, length))
  const stops: string[] = []
  for (let i = 0; i < steps; i++) {
    const a = alpha(((i + 0.5) * length) / steps - 0.5).toFixed(3)
    stops.push(
      `rgba(0,0,0,${a}) ${(i / steps) * 100}%`,
      `rgba(0,0,0,${a}) ${((i + 1) / steps) * 100}%`,
    )
  }
  return `linear-gradient(to right, ${stops.join(', ')})`
}

/** Fading in text others write; `animateText` marks what fades. */
export function appearance(config: Partial<AppearanceConfig> = {}): Extension {
  return [
    appearanceConfig.of(config),
    appearing,
    animator,
    revealing,
    revealer,
    revealTheme,
    growing,
    grower,
  ]
}

/*
 * The typing reveal of live agent changes (agent-presence.md section 3, "Client animation"), with
 * the rules of KodeEditor (docs/reveal.md, R1 to R4), so that an agent looks the same on Android:
 *
 * - R1: the text is in the document at once, and a decoration hides what is not typed yet, keeping
 *   its space. The chunks of an agent wait in a queue, in the order they come. A chunk right at the
 *   end of the newest hidden chunk joins it, one inside hidden text joins that text; any other is
 *   a new entry at the end, also one right at the start of hidden text. A new chunk never shows
 *   what is hidden. Only inserts are typed out: the new text of a replace shows at once, and
 *   fades in like the text of others. Nobody types into hidden text: a change of the person here, anywhere, and a
 *   change of anybody else inside the hidden text of a writer or right at its start or end, show
 *   all hidden text of that writer at once and end its fades (so does a click into it). Other
 *   changes move the hidden text.
 * - R2: the head is the start of the hidden text of the first entry; it goes on to the next entry
 *   in the same frame when there are characters left. The agent's cursor is drawn there.
 * - R3: each frame reveals `rate × elapsed` characters and carries the fraction; the first frame
 *   after a rest counts as 16 ms. When a chunk comes, `rate = max(rate, revealCharsPerSecond,
 *   hidden / revealMaxMs)`: no character waits longer than `revealMaxMs`. The rate never drops
 *   while text is hidden.
 * - R4: what a frame reveals fades in as one piece, in full: a new chunk does not end it.
 */

interface Revealing {
  tag: string
  from: number
  /** Where the hidden part starts: the head of the reveal. */
  hiddenFrom: number
  to: number
  /** Characters per second, the same for all ranges of a tag; it never drops while they last. */
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

/**
 * The chunks of a live change split by the change they come from: only inserts are typed out, the
 * new text of a replace shows at once (and fades in), as on Android.
 */
function splitChunks(tr: Transaction): { inserts: TaggedRange[]; replaces: TaggedRange[] } {
  const inserts: TaggedRange[] = []
  const replaces: TaggedRange[] = []
  for (const effect of tr.effects) {
    if (!effect.is(revealText)) continue
    for (const chunk of effect.value) {
      let replace = false
      tr.changes.iterChanges((fromA, toA, fromB, toB) => {
        if (fromA < toA && chunk.from >= fromB && chunk.to <= toB) replace = true
      })
      ;(replace ? replaces : inserts).push(chunk)
    }
  }
  return { inserts, replaces }
}

/**
 * The writers whose reveals a transaction shows at once (R1): all of them for a change of the
 * person here; else those whose hidden text a change of anybody else touches, inside or at an
 * edge. Each change on its own: only one that inserts a chunk of the writer (no replace) is its own.
 */
function finishedReveals(tr: Transaction): Set<string> | 'all' {
  if (isUserEdit(tr)) return 'all'
  const finished = new Set<string>()
  const before = tr.startState.field(revealing, false) ?? []
  if (!tr.docChanged || before.length === 0) return finished
  const chunks = tr.effects.flatMap((e) => (e.is(revealText) ? e.value : []))
  tr.changes.iterChanges((fromA, toA, fromB, toB) => {
    // only an insert of a chunk is the writer's own; a replace is not, as in KodeEditor
    const owners = new Set(
      fromA === toA
        ? chunks.filter((c) => c.from >= fromB && c.to <= toB && toB > fromB).map((c) => c.tag)
        : [],
    )
    for (const range of before)
      if (fromA <= range.to && toA >= range.hiddenFrom && !owners.has(range.tag))
        finished.add(range.tag)
  })
  return finished
}

/**
 * Maps the reveals through changes that do not touch their hidden text (see `finishedReveals`),
 * or that are their writer's own chunks: text inserted in front of hidden text moves it, text
 * inserted inside becomes part of it, text inserted right at its start or end stays out of it.
 */
function mapReveals(ranges: readonly Revealing[], changes: ChangeSet): Revealing[] {
  const mapped: Revealing[] = []
  for (const range of ranges) {
    const hiddenFrom = changes.mapPos(range.hiddenFrom, 1)
    const to = changes.mapPos(range.to, -1)
    const from = Math.min(changes.mapPos(range.from, 1), hiddenFrom)
    if (to > hiddenFrom) mapped.push({ ...range, from, hiddenFrom, to })
  }
  return mapped
}

/** Adds the chunks of a live change to the queues (R1), and raises the rates (R3). */
function enqueue(
  ranges: readonly Revealing[],
  chunks: readonly TaggedRange[],
  config: AppearanceConfig,
): Revealing[] {
  let next = [...ranges]
  for (const chunk of chunks) {
    const own = next.filter((r) => r.tag === chunk.tag)
    const newest = own.at(-1)
    // inside hidden text: the mapping made it part of that text already
    if (own.some((r) => r.hiddenFrom < chunk.from && chunk.to <= r.to)) continue
    if (newest && chunk.from === newest.to)
      next = next.map((r) => (r === newest ? { ...r, to: chunk.to } : r))
    else
      next.push({ tag: chunk.tag, from: chunk.from, hiddenFrom: chunk.from, to: chunk.to, rate: 0 })
  }
  for (const tag of new Set(chunks.map((c) => c.tag))) {
    const own = next.filter((r) => r.tag === tag)
    const hidden = own.reduce((sum, r) => sum + r.to - r.hiddenFrom, 0)
    const rate = Math.max(
      own[0]?.rate ?? 0,
      config.revealCharsPerSecond,
      (hidden * 1000) / config.revealMaxMs,
    )
    next = next.map((r) => (r.tag === tag ? { ...r, rate } : r))
  }
  return next
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
    let next = value
    if (tr.docChanged && next.length > 0) {
      const finished = finishedReveals(tr)
      if (finished === 'all') return []
      if (finished.size > 0) next = next.filter((r) => !finished.has(r.tag))
      next = mapReveals(next, tr.changes)
    }
    const config = tr.state.facet(appearanceConfig)
    if (fadesText(tr.state) && tr.effects.some((e) => e.is(revealText)))
      next = enqueue(next, splitChunks(tr).inserts, config)
    for (const effect of tr.effects) {
      if (effect.is(revealText)) {
        // queued above
      } else if (effect.is(finishReveal)) {
        next = next.filter((r) => r.tag !== effect.value)
      } else if (effect.is(advanceReveal)) {
        next = advance(next, effect.value.tag, effect.value.chars)
      }
    }
    // the setting went off, or the system now reduces motion: show it all
    if (next.length > 0 && !fadesText(tr.state)) return []
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

/** The first frame after a rest counts as this long, so that a chunk starts to show at once. */
const FIRST_FRAME_MS = 16

/**
 * Types the reveals out, a step in each frame, and lets a click on the text being revealed show it
 * at once. The step comes right after a frame, so that the next frame draws the text it uncovers
 * and the cursor at its head together (CodeMirror measures the cursors in a frame of its own).
 */
const revealer = ViewPlugin.fromClass(
  class implements PluginValue {
    private frame = 0
    private timer: ReturnType<typeof setTimeout> | null = null
    /** When the step before was; 0 at rest. */
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
      const tags = new Set(ranges.map((r) => r.tag))
      // a tag with nothing hidden starts anew
      for (const tag of this.carry.keys()) if (!tags.has(tag)) this.carry.delete(tag)
      if (ranges.length === 0) {
        this.cancel()
        this.last = 0
        return
      }
      if (this.frame || this.timer) return
      this.frame = requestAnimationFrame(() => {
        this.frame = 0
        this.timer = setTimeout(() => this.step(), 0)
      })
    }

    private cancel(): void {
      cancelAnimationFrame(this.frame)
      if (this.timer) clearTimeout(this.timer)
      this.frame = 0
      this.timer = null
    }

    private step(): void {
      this.timer = null
      const ranges = this.view.state.field(revealing)
      const time = now()
      const elapsed = this.last ? time - this.last : FIRST_FRAME_MS
      this.last = time
      const effects: StateEffect<unknown>[] = []
      for (const tag of new Set(ranges.map((r) => r.tag))) {
        const head = ranges.find((r) => r.tag === tag)!
        const exact = (this.carry.get(tag) ?? 0) + (head.rate * elapsed) / 1000
        const chars = Math.floor(exact)
        this.carry.set(tag, exact - chars)
        if (chars === 0) continue
        effects.push(advanceReveal.of({ tag, chars }))
        // what is uncovered fades in, as one piece and in full
        effects.push(revealPiece.of(uncovered(ranges, tag, chars)))
      }
      if (effects.length > 0) this.view.dispatch({ effects })
      this.schedule()
    }

    destroy(): void {
      this.cancel()
    }
  },
  {
    eventHandlers: {
      mousedown(event, view) {
        const pos = view.posAtCoords({ x: event.clientX, y: event.clientY }, false)
        // any text of an agent's reveal, also its later ranges: nobody clicks into hidden text
        const tags = new Set(
          view.state
            .field(revealing)
            .filter((r) => pos >= r.from && pos <= r.to)
            .map((r) => r.tag),
        )
        for (const tag of tags) view.dispatch({ effects: finishReveal.of(tag) })
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
  // the closing gap of removed text (`GapWidget`)
  '.cm-closing-gap': { display: 'inline-block', height: '1px', verticalAlign: 'baseline' },
})

/** The ranges that fade right now, with the ids of their spans (`data-appear`). */
export function appearingSpans(
  state: EditorState,
): readonly { id: string; from: number; to: number; duration: number }[] {
  return (
    state
      .field(appearing, false)
      ?.ranges.map((r) => ({ id: String(r.id), from: r.from, to: r.to, duration: r.duration })) ??
    []
  )
}

/** The ranges that fade right now, for tests. */
export function appearingRanges(state: EditorView['state']): readonly TaggedRange[] {
  return state.field(appearing, false)?.ranges.map(({ tag, from, to }) => ({ tag, from, to })) ?? []
}

/*
 * Inserted text of others grows its space (R6 and R6b of KodeEditor's docs/reveal.md): it starts
 * about zero wide and widens to its full width, so the text after it, a new wrap and the lines
 * below move smoothly instead of jumping. Done by letter-spacing from -1ch (one advance less per
 * character: zero in the editor's monospace font) to normal, so the browser lays it all out on the
 * way; hidden text of a reveal ends up keeping its full space.
 *
 * - An insert grows over `GROW_MS` with the ease-out of the carets; a chunk of an agent once, when
 *   it arrives (nothing moves while it is revealed).
 * - Typing: an insert of at most `TYPING_CHARS` characters right behind the one before of the same
 *   writer, at most `TYPING_WITHIN_MS` after it, grows with the timing of the caret's typing steps
 *   (`typingTiming`, R5b and R5c): for fast keys at an even speed for 1.5 times the time between
 *   them, from a frame early, so that the text does not stand still for a frame at each key; for
 *   slow keys in short ease-out steps; in between a blend.
 * - A growth that starts while others of the same writer run takes them along: they stop where they
 *   are and go on from there, with the new one's time and curve. So the edge moves on evenly.
 * - The caret of the writer, right behind its insert, is carried by the layout: it is drawn at the
 *   moving edge (`cursorGlide`), so the text behind it moves exactly with it.
 *
 * Removed text of others slides (R6): the characters go at once, and a gap of their width in their
 * place closes over `GROW_MS` with the same ease-out, so the text after it moves on smoothly too.
 * A backspace, a removal of at most `TYPING_CHARS` characters that ends where the writer typed
 * last, within `TYPING_WITHIN_MS`, is typing backwards: it closes with the timing of typing and
 * takes the growths and gaps of the writer along, as typing does, and an
 * insert there right after it goes on typing. The writer's caret is right behind the gap and moves
 * with it. Not for removals across lines (the lines below would jump anyway), nor long ones.
 *
 * Never for local changes (only `animateText`, `revealText` and `remoteChange` mark changes of
 * others), and under the settings of the fade.
 */
export const GROW_MS = 120
/** Ease-out cubic, as the carets glide (`cursorGlide`), for browsers without CSS `linear()`. */
const GROW_EASING = 'cubic-bezier(0.33, 1, 0.68, 1)'

/** The easing of a growth: the way of `growProgress`. */
function growEasing(crisp: number): string {
  if (crisp <= 0) return 'linear'
  const supported =
    typeof CSS !== 'undefined' && CSS.supports?.('transition-timing-function', 'linear(0, 1)')
  return supported ? typingEasing(crisp) : GROW_EASING
}
/** How long after its end a growth still carries the caret at its end (`growsUpTo`). */
const CARRY_MS = 250
/** Longer removals go at once: a gap wider than a line would wrap. */
const MAX_GAP_CHARS = 80

interface Growing {
  tag: string
  from: number
  to: number
  start: number
  duration: number
  /** Its way: `typingWay` with this, 0 for an even speed (fast typing), 1 for the ease-out. */
  crisp: number
  /**
   * The letter-spacing it starts from, in ch: -1 for new text, more for one taken along. For a gap
   * the width it starts from, in ch.
   */
  spacing: number
  /** The gap of removed text, at `from` (= `to`). */
  gap?: boolean
  id: number
}

/** The newest key of a writer: where it ends, when it came, and the time between keys. */
interface LastKey {
  to: number
  began: number
  interval?: number
}

interface GrowState {
  ranges: readonly Growing[]
  /** The newest insert or backspace of each writer. */
  last: ReadonlyMap<string, LastKey>
}

/** How far a growth is at `time`, from 0 to 1. */
function growProgress(range: Growing, time: number): number {
  const t = Math.min(1, Math.max(0, (time - range.start) / range.duration))
  return typingWay(t, range.crisp)
}

const expireGrowing = StateEffect.define<number>()

const growing = StateField.define<GrowState>({
  create: () => ({ ranges: [], last: new Map() }),
  update(value, tr) {
    let { ranges } = value
    let last = value.last
    if (tr.docChanged && (ranges.length > 0 || last.size > 0)) {
      ranges = ranges
        .map((r) => ({
          ...r,
          // a gap stays in front of what comes in at its place, as its widget
          from: tr.changes.mapPos(r.from, r.gap ? -1 : 1),
          to: tr.changes.mapPos(r.to, -1),
        }))
        .filter((r) => r.gap || r.to > r.from)
      last = new Map(
        [...last].map(([tag, l]) => [tag, { ...l, to: tr.changes.mapPos(l.to, -1) }] as const),
      )
    }
    const config = tr.state.facet(appearanceConfig)
    const grows =
      config.enabled &&
      !reducedMotion() &&
      (typeof document === 'undefined' || document.visibilityState !== 'hidden')
    if (!grows)
      return ranges.length === 0 && last.size === 0 ? value : { ranges: [], last: new Map() }
    const time = now()
    /** Starts a growth or gap; the running ones of its writer go on with it. */
    const start = (range: Omit<Growing, 'id' | 'start'>, early: number) => {
      // typed fast: a frame early, so that the text does not stand still for a frame at each key
      const begin = time - early
      // a removal of nobody known ('') takes nothing along
      ranges = ranges.map((g) =>
        range.tag !== '' && g.tag === range.tag && time < g.start + g.duration
          ? {
              ...g,
              spacing: g.spacing * (1 - growProgress(g, time)),
              start: begin,
              duration: range.duration,
              crisp: range.crisp,
              id: nextId++,
            }
          : g,
      )
      ranges = [...ranges, { ...range, start: begin, id: nextId++ }]
    }
    /** Whether a change at `from` is typing on from the writer's last key `before`, and its timing. */
    const typed = (before: LastKey | undefined, from: number, chars: number) => {
      const typing =
        chars <= TYPING_CHARS &&
        !!before &&
        before.to === from &&
        time - before.began <= TYPING_WITHIN_MS
      if (!typing) return { typing, interval: undefined, duration: GROW_MS, crisp: 1, early: 0 }
      // the time between the keys, smoothed as the cursor's (cursorGlide, R5b)
      const interval = smoothInterval(before!.interval, time - before!.began)
      return { typing, interval, ...typingStep(interval) }
    }
    // removals of others slide; backspace by the old place of the writer's last key
    if (tr.docChanged && tr.annotation(remoteChange)) {
      const removals: { fromA: number; toA: number; at: number }[] = []
      tr.changes.iterChanges((fromA, toA, fromB) => {
        if (toA > fromA) removals.push({ fromA, toA, at: fromB })
      })
      for (const { fromA, toA, at } of removals) {
        const chars = toA - fromA
        if (chars > MAX_GAP_CHARS || tr.startState.doc.sliceString(fromA, toA).includes('\n'))
          continue
        // where the writer typed last, before this change
        const writer = [...value.last].find(([, l]) => l.to === toA)?.[0]
        const { typing, interval, duration, crisp, early } = typed(
          writer === undefined ? undefined : value.last.get(writer),
          toA,
          chars,
        )
        const tag = typing ? writer! : ''
        start({ tag, from: at, to: at, duration, crisp, spacing: chars, gap: true }, early)
        if (typing)
          last = new Map(last).set(tag, {
            to: at,
            began: time,
            ...(interval === undefined ? {} : { interval }),
          })
      }
    }
    for (const effect of tr.effects) {
      if (effect.is(expireGrowing))
        ranges = ranges.filter((r) => r.start + r.duration + CARRY_MS > effect.value)
      if (!tr.docChanged) continue
      const revealed = effect.is(revealText)
      if (!revealed && !effect.is(animateText)) continue
      const added = effect.value as readonly TaggedRange[]
      if (added.reduce((sum, r) => sum + r.to - r.from, 0) > config.revealMaxChars) continue
      for (const r of added) {
        // mapped through this change: a backspace in it moved it
        const timing = revealed
          ? typed(undefined, r.from, 0)
          : typed(last.get(r.tag), r.from, r.to - r.from)
        const { interval, duration, crisp, early } = timing
        start({ tag: r.tag, from: r.from, to: r.to, duration, crisp, spacing: -1 }, early)
        last = new Map(last).set(r.tag, {
          to: r.to,
          began: time,
          ...(interval === undefined ? {} : { interval }),
        })
      }
    }
    return ranges === value.ranges && last === value.last ? value : { ranges, last }
  },
  provide: (field) =>
    EditorView.decorations.from(field, ({ ranges }): DecorationSet =>
      Decoration.set(
        ranges.map((r) =>
          r.gap
            ? // before the caret of the writer (`side: 1`), which it then carries along
              Decoration.widget({ widget: new GapWidget(r), side: -1 }).range(r.from)
            : Decoration.mark({ attributes: { 'data-grow': String(r.id) } }).range(r.from, r.to),
        ),
        true,
      ),
    ),
})

/** The closing gap of removed text, as wide as it is right now; the grower runs it. */
class GapWidget extends WidgetType {
  constructor(private readonly range: Growing) {
    super()
  }

  override eq(other: GapWidget): boolean {
    return other.range.id === this.range.id
  }

  toDOM(): HTMLElement {
    const gap = document.createElement('span')
    gap.className = 'cm-closing-gap'
    gap.dataset.grow = String(this.range.id)
    gap.setAttribute('aria-hidden', 'true')
    const width = this.range.spacing * (1 - growProgress(this.range, now()))
    gap.style.width = `${Math.max(0, width)}ch`
    return gap
  }
}

/** The growths under way, for tests. */
export function growthsForTests(state: EditorState): readonly Growing[] {
  return state.field(growing, false)?.ranges ?? []
}

/**
 * Whether text that grows right now ends at `pos`: a caret there is carried by the layout. Also a
 * while after: a browser under load may draw its next frame only once the growth is over, and the
 * caret is then where the layout put it, not to glide there from where it was.
 */
export function growsUpTo(state: EditorState, pos: number, time = now()): boolean {
  return (state.field(growing, false)?.ranges ?? []).some(
    (r) => r.to === pos && time < r.start + r.duration + CARRY_MS,
  )
}

/** Runs the growing as Web Animations, which go on in spans drawn anew (see `animator`). */
const grower = ViewPlugin.fromClass(
  class implements PluginValue {
    /** The growth each span runs, by its id: a span taken along gets a new one. */
    private readonly running = new WeakMap<Element, { id: string; animation: Animation }>()
    private timer: ReturnType<typeof setTimeout> | null = null

    constructor(private readonly view: EditorView) {
      this.schedule()
    }

    update(update: ViewUpdate): void {
      if (update.startState.field(growing) !== update.state.field(growing)) this.schedule()
      else if (update.state.field(growing).ranges.length > 0) this.requestAnimate()
    }

    private requestAnimate(): void {
      this.view.requestMeasure({ key: this, read: () => null, write: () => this.animate() })
    }

    private schedule(): void {
      const { ranges } = this.view.state.field(growing)
      if (this.timer) clearTimeout(this.timer)
      this.timer = null
      if (ranges.length === 0) return
      this.requestAnimate()
      const end = Math.min(...ranges.map((r) => r.start + r.duration + CARRY_MS))
      this.timer = setTimeout(
        () => {
          this.timer = null
          this.view.dispatch({ effects: expireGrowing.of(now()) })
        },
        Math.max(0, end - now()) + 16,
      )
    }

    private animate(): void {
      const byId = new Map(this.view.state.field(growing).ranges.map((r) => [String(r.id), r]))
      for (const span of this.view.contentDOM.querySelectorAll<HTMLElement>('[data-grow]')) {
        const id = span.dataset.grow ?? ''
        const before = this.running.get(span)
        if (before?.id === id || typeof span.animate !== 'function') continue
        const range = byId.get(id)
        if (!range) continue
        before?.animation.cancel()
        const property = range.gap ? 'width' : 'letterSpacing'
        const animation = span.animate(
          [{ [property]: `${range.spacing}ch` }, { [property]: '0ch' }],
          {
            duration: range.duration,
            easing: growEasing(range.crisp),
            fill: 'backwards',
          },
        )
        animation.startTime = range.start
        this.running.set(span, { id, animation })
      }
    }

    destroy(): void {
      if (this.timer) clearTimeout(this.timer)
    }
  },
)

/** The ranges that grow right now, for tests. */
export function growingRanges(state: EditorView['state']): readonly { from: number; to: number }[] {
  return state.field(growing, false)?.ranges.map(({ from, to }) => ({ from, to })) ?? []
}
