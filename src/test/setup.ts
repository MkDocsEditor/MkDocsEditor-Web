import { afterEach, vi } from 'vitest'

import { setApiClient } from '@/api'

afterEach(() => setApiClient(null))

// vi.waitFor gives up after 1 s by default, which a busy machine (CI, parallel runs) exceeds
// while rendering. It returns as soon as the condition holds, so a longer limit costs nothing.
const waitFor = vi.waitFor.bind(vi)
vi.waitFor = ((callback, options) =>
  waitFor(
    callback,
    typeof options === 'number' ? options : { timeout: 10_000, ...options },
  )) as typeof vi.waitFor

// jsdom lacks a few browser APIs that Vuetify overlays and CodeMirror use.

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver

if (!('visualViewport' in globalThis) || !globalThis.visualViewport) {
  Object.defineProperty(globalThis, 'visualViewport', {
    configurable: true,
    value: Object.assign(new EventTarget(), {
      width: 1024,
      height: 768,
      offsetLeft: 0,
      offsetTop: 0,
      pageLeft: 0,
      pageTop: 0,
      scale: 1,
    }),
  })
}

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    Object.assign(new EventTarget(), {
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
    }) as unknown as MediaQueryList
}

document.createRange ??= () => new Range()

// CodeMirror measures text through ranges, which jsdom does not lay out.
const emptyRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList
Range.prototype.getClientRects ??= emptyRects
Range.prototype.getBoundingClientRect ??= () => new DOMRect()
