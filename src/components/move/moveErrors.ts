import { ApiError } from '@/api'
import { errorMessage } from '@/services/errors'

/** A sentence for an error of `POST /move/` (`docs/references.md` section 11). */
export function moveErrorText(error: unknown): string {
  if (!(error instanceof ApiError)) return errorMessage(error)
  const reason = typeof error.details.reason === 'string' ? error.details.reason : ''
  if (error.status === 409) {
    const path = typeof error.details.path === 'string' ? error.details.path : 'An item'
    return `“${path}” exists already. Choose another folder or name.`
  }
  if (error.status === 400) {
    switch (reason) {
      case 'invalid-name':
        return 'This name is not allowed.'
      case 'blacklisted':
        return 'This place is excluded from the wiki (blacklisted, or a stylesheet of the theme).'
      case 'into-itself':
        return 'A folder cannot move into itself.'
      case 'root':
        return 'The top folder cannot be moved.'
      case 'no-change':
        return 'Choose another folder or name.'
    }
  }
  if (error.status === 403) return 'Only editors and admins can move items.'
  if (error.status === 404 && error.code !== 'not-found')
    return 'This server cannot move items yet. Update the backend.'
  if (error.status === 404) return 'The item or the folder does not exist any more.'
  if (error.status === 0) return 'The server is unreachable. Moving needs a connection.'
  return error.message
}
