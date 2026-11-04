import { ApiError } from '@/api'

/**
 * What to tell the user about a failure, with the same wording as the Android app. Exception
 * texts and the server's own messages are written for developers, so they only go to the log.
 */
export function userMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.isNetworkError) return "Can't reach the server. Check your connection and try again."
    if (error.status === 401 || error.status === 403)
      return "You don't have access to this. Try signing in again."
    if (error.status === 404) return 'This no longer exists on the server.'
    if (error.status === 409) return 'This is not possible right now.'
    if (error.status >= 500) return 'The server has a problem. Please try again later.'
  }
  console.error('mkdocseditor: unexpected error', error)
  return 'Something went wrong. Please try again.'
}

/** Whether trying the same thing again can work: the request itself was not the problem. */
export function canRetry(error: unknown): boolean {
  return error instanceof ApiError && (error.isNetworkError || error.status >= 500)
}
