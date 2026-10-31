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
