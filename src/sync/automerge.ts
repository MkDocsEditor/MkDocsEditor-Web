import * as Automerge from '@automerge/automerge/slim'

let ready: Promise<typeof Automerge> | null = null

/**
 * Loads the Automerge WebAssembly module on first use. The module is bundled as base64 in a
 * separate chunk, so pages without an open document do not download it.
 */
export function loadAutomerge(): Promise<typeof Automerge> {
  ready ??= import('@automerge/automerge/automerge.wasm.base64')
    .then(({ automergeWasmBase64 }) => Automerge.initializeBase64Wasm(automergeWasmBase64))
    .then(() => Automerge)
    .catch((error: unknown) => {
      ready = null
      throw error
    })
  return ready
}

export type { Automerge }
