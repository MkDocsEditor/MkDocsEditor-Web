import { Annotation, Facet, Prec, StateEffect, StateField } from '@codemirror/state'
import type { ChangeSet, EditorState, Extension, Transaction } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin } from '@codemirror/view'
import type { DecorationSet, PluginValue, ViewUpdate } from '@codemirror/view'

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
  /** How long a character takes to fade in. */
  fadeMs: number
  /**
   * How many of the newest characters of a writer fade; older ones show at once. Not for the
   * pieces of a reveal: they always fade in full.
   */
  window: number
  /** At most this many ranges fade at the same time; the oldest show at once. */
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
  /** A piece of a reveal: never cut by the window or the most ranges, only by a user edit. */
  reveal?: boolean
}

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

/**
 * Keeps the newest `window` characters of each writer, and the newest `maxRanges` ranges; and all
 * pieces of reveals.
 */
function trim(ranges: readonly Appearing[], config: AppearanceConfig): Appearing[] {
  const left = new Map<string, number>()
  const kept: Appearing[] = []
  let counted = 0
  for (let i = ranges.length - 1; i >= 0; i--) {
    const range = ranges[i]!
    if (range.reveal) {
      kept.push(range)
      continue
    }
    if (counted >= config.maxRanges) continue
    const room = left.get(range.tag) ?? config.window
    if (room <= 0) continue
    const from = Math.max(range.from, range.to - room)
    left.set(range.tag, room - (range.to - from))
    counted++
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
  // a reveal shown at once ends the fades of its writer; a change of the person, all of reveals
  const finished = finishedReveals(tr)
  if (finished === 'all' && next.some((r) => r.reveal)) next = next.filter((r) => !r.reveal)
  else if (finished !== 'all' && finished.size > 0) next = next.filter((r) => !finished.has(r.tag))
  for (const effect of tr.effects) {
    if (effect.is(animateText) || effect.is(revealPiece)) {
      if (!config.enabled || reducedMotion()) continue
      const start = now()
      const length = tr.state.doc.length
      const reveal = effect.is(revealPiece)
      for (const range of effect.value) {
        const from = Math.max(0, Math.min(length, range.from))
        const to = Math.max(0, Math.min(length, range.to))
        if (to > from)
          next = [
            ...next,
            { tag: range.tag, from, to, start, id: nextId++, ...(reveal ? { reveal } : {}) },
          ]
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
 *   what is hidden. Nobody types into hidden text: a change of the person here, anywhere, and a
 *   change of anybody else inside the hidden text of a writer or right at its start or end, show
 *   all hidden text of that writer at once and end its fades (so does a click into it). Other
 *   changes move the hidden text.
 * - R2: the head is the start of the hidden text of the first entry; it goes on to the next entry
 *   in the same frame when there are characters left. The agent's cursor is drawn there.
 * - R3: each frame reveals `rate × elapsed` characters and carries the fraction; the first frame
 *   after a rest counts as 16 ms. When a chunk comes, `rate = max(rate, revealCharsPerSecond,
 *   hidden / revealMaxMs)`: no character waits longer than `revealMaxMs`. The rate never drops
 *   while text is hidden.
 * - R4: what a frame reveals fades in as one piece, in full: neither a new chunk nor the window of
 *   fades ends it.
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
 * The writers whose reveals a transaction shows at once (R1): all of them for a change of the
 * person here; else those whose hidden text a change of anybody else touches, inside or at an
 * edge. A change that inserts a chunk of the writer's own is not one of anybody else.
 */
function finishedReveals(tr: Transaction): Set<string> | 'all' {
  if (isUserEdit(tr)) return 'all'
  const finished = new Set<string>()
  const before = tr.startState.field(revealing, false) ?? []
  if (!tr.docChanged || before.length === 0) return finished
  const chunks = tr.effects.flatMap((e) => (e.is(revealText) ? e.value : []))
  tr.changes.iterChanges((fromA, toA, fromB, toB) => {
    const owners = new Set(
      chunks.filter((c) => c.from >= fromB && c.to <= toB && toB > fromB).map((c) => c.tag),
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
    for (const effect of tr.effects) {
      if (effect.is(revealText)) {
        if (fadesText(tr.state)) next = enqueue(next, effect.value, config)
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
})

/** The ranges that fade right now, for tests. */
export function appearingRanges(state: EditorView['state']): readonly TaggedRange[] {
  return state.field(appearing, false)?.map(({ tag, from, to }) => ({ tag, from, to })) ?? []
}

/*
 * Inserted text of others grows its space: it starts about zero wide and widens to its full width
 * over `GROW_MS`, with the ease-out of the carets, so the text after it, a new wrap and the lines
 * below move smoothly instead of jumping. Done by letter-spacing from -1ch (one advance less per
 * character: zero in the editor's monospace font) to normal, so the browser lays it all out on
 * the way; hidden text of a reveal ends up keeping its full space. For live agent changes and for
 * remote inserts of `MIN_GROW_CHARS` or more; never for local typing (only `animateText` and
 * `revealText` mark text), and under the settings of the fade.
 */
export const GROW_MS = 120
export const MIN_GROW_CHARS = 4
/** Ease-out cubic, as the carets glide (`cursorGlide`). */
const GROW_EASING = 'cubic-bezier(0.33, 1, 0.68, 1)'

interface Growing {
  from: number
  to: number
  start: number
  id: number
}

const expireGrowing = StateEffect.define<number>()

const growing = StateField.define<readonly Growing[]>({
  create: () => [],
  update(ranges, tr) {
    let next = ranges
    if (tr.docChanged && next.length > 0)
      next = next
        .map((r) => ({ ...r, from: tr.changes.mapPos(r.from, 1), to: tr.changes.mapPos(r.to, -1) }))
        .filter((r) => r.to > r.from)
    const config = tr.state.facet(appearanceConfig)
    const grows =
      config.enabled &&
      !reducedMotion() &&
      (typeof document === 'undefined' || document.visibilityState !== 'hidden')
    for (const effect of tr.effects) {
      if (effect.is(expireGrowing)) next = next.filter((r) => r.start + GROW_MS > effect.value)
      if (!grows || !tr.docChanged) continue
      const revealed = effect.is(revealText)
      if (!revealed && !effect.is(animateText)) continue
      const added = (effect.value as readonly TaggedRange[]).filter(
        (r) => revealed || r.to - r.from >= MIN_GROW_CHARS,
      )
      if (added.reduce((sum, r) => sum + r.to - r.from, 0) > config.revealMaxChars) continue
      const start = now()
      next = [...next, ...added.map((r) => ({ from: r.from, to: r.to, start, id: nextId++ }))]
    }
    return grows ? next : []
  },
  provide: (field) =>
    EditorView.decorations.from(field, (ranges): DecorationSet =>
      Decoration.set(
        ranges.map((r) =>
          Decoration.mark({ attributes: { 'data-grow': String(r.id) } }).range(r.from, r.to),
        ),
        true,
      ),
    ),
})

/** Runs the growing as Web Animations, which go on in spans drawn anew (see `animator`). */
const grower = ViewPlugin.fromClass(
  class implements PluginValue {
    private readonly started = new WeakSet<Element>()
    private timer: ReturnType<typeof setTimeout> | null = null

    constructor(private readonly view: EditorView) {
      this.schedule()
    }

    update(update: ViewUpdate): void {
      if (update.startState.field(growing) !== update.state.field(growing)) this.schedule()
      else if (update.state.field(growing).length > 0) this.requestAnimate()
    }

    private requestAnimate(): void {
      this.view.requestMeasure({ key: this, read: () => null, write: () => this.animate() })
    }

    private schedule(): void {
      const ranges = this.view.state.field(growing)
      if (this.timer) clearTimeout(this.timer)
      this.timer = null
      if (ranges.length === 0) return
      this.requestAnimate()
      const end = Math.min(...ranges.map((r) => r.start + GROW_MS))
      this.timer = setTimeout(
        () => {
          this.timer = null
          this.view.dispatch({ effects: expireGrowing.of(now()) })
        },
        Math.max(0, end - now()) + 16,
      )
    }

    private animate(): void {
      const starts = new Map(this.view.state.field(growing).map((r) => [String(r.id), r.start]))
      for (const span of this.view.contentDOM.querySelectorAll<HTMLElement>('[data-grow]')) {
        if (this.started.has(span) || typeof span.animate !== 'function') continue
        const start = starts.get(span.dataset.grow ?? '')
        if (start === undefined) continue
        this.started.add(span)
        const animation = span.animate([{ letterSpacing: '-1ch' }, { letterSpacing: '0ch' }], {
          duration: GROW_MS,
          easing: GROW_EASING,
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

/** The ranges that grow right now, for tests. */
export function growingRanges(state: EditorView['state']): readonly { from: number; to: number }[] {
  return state.field(growing, false)?.map(({ from, to }) => ({ from, to })) ?? []
}
