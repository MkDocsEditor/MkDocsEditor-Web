import { getConfig } from '@/services/config'

import { AuthApi } from './auth'
import { ApiClient } from './client'

let sessionEndedHandler: () => void = () => {}
let client: ApiClient | null = null
let authClient: AuthApi | null = null

/** Registers what happens when a request finds the session ended (the auth store logs out). */
export function setSessionEndedHandler(handler: () => void): void {
  sessionEndedHandler = handler
}

/** The shared API client, created on first use from the runtime config. */
export function useApi(): ApiClient {
  client ??= new ApiClient({ baseUrl: getConfig().backendUrl })
  client.onSessionEnded = () => sessionEndedHandler()
  return client
}

/** Account, login and admin endpoints on the shared client. */
export function useAuthApi(): AuthApi {
  const api = useApi()
  if (!authClient || authClient.client !== api) authClient = new AuthApi(api)
  return authClient
}

/** Replaces the shared client, for tests. */
export function setApiClient(next: ApiClient | null): void {
  client = next
  authClient = null
}

export { AuthApi } from './auth'
export { ApiClient, ApiError } from './client'
export type * from './types'
