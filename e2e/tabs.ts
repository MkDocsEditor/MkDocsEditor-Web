import type { Page, WebSocketRoute } from '@playwright/test'

/**
 * Hides the page and throttles its timers like Chrome does for a tab that is in the background
 * for a while: timers only run at a wake-up once per `periodMs`, while network events (and so
 * websocket messages) still arrive at once. A real hidden tab cannot be had in headless Chromium.
 */
export async function installBackgroundTab(page: Page, periodMs: number): Promise<void> {
  await page.addInitScript((period) => {
    const realTimeout = window.setTimeout.bind(window)
    const realInterval = window.setInterval.bind(window)
    let throttled = false
    let hidden = false
    const due = new Map<unknown, () => void>()
    const run = (key: unknown, fn: () => void) => {
      if (throttled) due.set(key, fn)
      else fn()
    }
    window.setTimeout = ((fn: () => void, ms?: number, ...args: unknown[]) => {
      const key = {}
      return realTimeout(() => run(key, () => fn(...(args as []))), ms)
    }) as typeof window.setTimeout
    window.setInterval = ((fn: () => void, ms?: number, ...args: unknown[]) => {
      const key = {}
      return realInterval(() => run(key, () => fn(...(args as []))), ms)
    }) as typeof window.setInterval
    const wake = () => {
      const fns = [...due.values()]
      due.clear()
      for (const fn of fns) fn()
    }
    realInterval(() => {
      if (throttled) wake()
    }, period)
    Object.defineProperty(document, 'visibilityState', {
      get: () => (hidden ? 'hidden' : 'visible'),
    })
    Object.defineProperty(document, 'hidden', { get: () => hidden })
    Object.assign(window, {
      setBackground(on: boolean) {
        hidden = on
        throttled = on
        document.dispatchEvent(new Event('visibilitychange'))
        if (!on) wake()
      },
    })
  }, periodMs)
}

export function setBackground(page: Page, on: boolean): Promise<void> {
  return page.evaluate(
    (value) => (window as unknown as { setBackground(v: boolean): void }).setBackground(value),
    on,
  )
}

/** Lets a test close the websockets of a page like a lost connection would. */
export async function trackSockets(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const Real = window.WebSocket
    const sockets: WebSocket[] = []
    window.WebSocket = new Proxy(Real, {
      construct(target, args: [string]) {
        const socket = new target(...args)
        sockets.push(socket)
        return socket
      },
    })
    Object.assign(window, { pageSockets: sockets })
  })
}

export function dropDocumentSocket(page: Page): Promise<void> {
  return page.evaluate(() => {
    const { pageSockets } = window as unknown as { pageSockets: WebSocket[] }
    pageSockets.findLast((s) => s.url.includes('/document/'))?.close()
  })
}

/**
 * Lets a test cut the document websockets of a page while REST keeps working, so that edits stay
 * unsynced and the user can still sign out. Call it before the page opens a document.
 */
export async function blockableDocumentSockets(page: Page) {
  let blocked = false
  const open = new Set<WebSocketRoute>()
  await page.routeWebSocket(/\/document\/.*\/ws/, (ws) => {
    if (blocked) {
      void ws.close({ code: 1011 })
      return
    }
    ws.connectToServer()
    open.add(ws)
  })
  return {
    async block(): Promise<void> {
      blocked = true
      for (const ws of open) await ws.close({ code: 1011 })
      open.clear()
    },
    unblock(): void {
      blocked = false
    },
  }
}
