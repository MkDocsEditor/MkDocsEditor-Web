import { getConfig } from '@/services/config'

import { ApiClient } from './client'
import type { Credentials } from './types'

let credentialsProvider: () => Credentials | null = () => null
let client: ApiClient | null = null

/** Registers where the API client gets its credentials from (the auth store). */
export function setCredentialsProvider(provider: () => Credentials | null): void {
  credentialsProvider = provider
}

/** The shared API client, created on first use from the runtime config. */
export function useApi(): ApiClient {
  client ??= new ApiClient({
    baseUrl: getConfig().backendUrl,
    getCredentials: () => credentialsProvider(),
  })
  return client
}

/** Replaces the shared client, for tests. */
export function setApiClient(next: ApiClient | null): void {
  client = next
}

export { ApiClient, ApiError } from './client'
export type * from './types'
