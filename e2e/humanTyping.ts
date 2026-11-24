/**
 * Keys at the times of a person who types, as in KodeEditor's docs/typing-pattern.md, so that
 * animations are judged with realistic timing: log-normal gaps around 150 ms, common pairs faster,
 * bursts, longer gaps after spaces and punctuation, pauses to think, and typos with backspace.
 * The same seed gives the same keys.
 */
export interface Keystroke {
  /** A character, or 'Backspace'. */
  key: string
  /** When, in ms from the start. */
  at: number
}

const PAIRS = new Set(
  'th he in er an re on at en nd ti es or te of ed is it al ar st to nt ng se ha as ou io le ve co me de hi ri'.split(
    ' ',
  ),
)
const ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
const PUNCTUATION = '.,;:!?)\n'

/** A seeded random number generator (mulberry32), from 0 to 1. */
function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** `median`: the gap between keys around which they spread, 150 ms for a person, 70 for a fast one. */
export function humanKeystrokes(text: string, seed = 6, median = 150): Keystroke[] {
  const rand = random(seed)
  const uniform = (from: number, to: number) => from + rand() * (to - from)
  const normal = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand())
  let burst = 0

  /** The time before `char`, typed after `before`: steps 1, 2, 3 and 4. */
  function gap(before: string, char: string): number {
    let time = Math.exp(Math.log(median) + 0.4 * normal())
    if (PAIRS.has((before + char).toLowerCase())) time *= 0.7
    if (burst > 0) {
      time *= 0.5
      burst--
    } else if (rand() < 0.04) burst = 3 + Math.floor(rand() * 4)
    return Math.min(400, Math.max(Math.min(60, median / 2), time))
  }

  /** Step 5: what comes on top after `char`. */
  function after(char: string): number {
    let time = 0
    if (char === ' ') time += uniform(40, 120)
    if (PUNCTUATION.includes(char)) time += uniform(300, 700)
    if (rand() < 0.015) time += uniform(1000, 2000)
    return time
  }

  function neighbor(char: string): string | undefined {
    const lower = char.toLowerCase()
    const row = ROWS.find((r) => r.includes(lower))
    if (!row) return undefined
    const i = row.indexOf(lower)
    const options = [row[i - 1], row[i + 1]].filter((c): c is string => !!c)
    const wrong = options[Math.floor(rand() * options.length)]!
    return char === lower ? wrong : wrong.toUpperCase()
  }

  const keys: Keystroke[] = []
  let time = 0
  let previous = ''
  let i = 0
  while (i < text.length) {
    const char = text[i]!
    time += gap(previous, char)
    const wrong = rand() < 0.03 ? neighbor(char) : undefined
    if (wrong) {
      keys.push({ key: wrong, at: time })
      // a few right keys before the person notices
      const more = Math.min(Math.floor(rand() * 3), text.length - i - 1)
      let last = wrong
      for (let k = 1; k <= more; k++) {
        const next = text[i + k]!
        time += gap(last, next)
        keys.push({ key: next, at: time })
        last = next
      }
      time += uniform(200, 500)
      keys.push({ key: 'Backspace', at: time })
      for (let k = 0; k < more; k++) {
        time += uniform(80, 160)
        keys.push({ key: 'Backspace', at: time })
      }
      time += uniform(80, 160)
    }
    keys.push({ key: char, at: time })
    time += after(char)
    previous = char
    i++
  }
  return keys
}
