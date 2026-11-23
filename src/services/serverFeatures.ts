import { useAuthApi } from '@/api'

let features: Promise<readonly string[]> | null = null

/**
 * The optional features of the server (`features` of `GET /server-info/`), asked once per page
 * load; asked again after a failure.
 */
export function serverFeatures(): Promise<readonly string[]> {
  features ??= useAuthApi()
    .serverInfo()
    .then((info) => info.features ?? [])
    .catch((error: unknown) => {
      features = null
      throw error
    })
  return features
}

/** For tests: forget what the server said. */
export function resetServerFeatures(): void {
  features = null
}
