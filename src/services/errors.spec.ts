import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '@/api'
import { describeError } from '@/stores/notify'

import { userMessage } from './errors'

describe('userMessage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('picks the message by the kind of failure', () => {
    const text = (status: number) => userMessage(new ApiError('internal text', status))
    expect(text(0)).toContain("Can't reach the server")
    expect(text(401)).toContain("You don't have access")
    expect(text(403)).toContain("You don't have access")
    expect(text(404)).toBe('This no longer exists on the server.')
    expect(text(409)).toBe('This is not possible right now.')
    expect(text(502)).toBe('The server has a problem. Please try again later.')
  })

  it('never shows the text of an exception or of the server, but logs the unexpected', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const typeError = new TypeError('x is not a function')
    expect(userMessage(typeError)).toBe('Something went wrong. Please try again.')
    expect(log).toHaveBeenCalledWith('mkdocseditor: unexpected error', typeError)
    expect(userMessage(new ApiError('invalid JSON: unexpected token', 400))).toBe(
      'Something went wrong. Please try again.',
    )
  })
})

describe('describeError', () => {
  it('keeps messages that are meant for the user', () => {
    expect(describeError('Select the link instead.')).toBe('Select the link instead.')
    expect(describeError(new ApiError('x', 409, 'username-taken'))).toBe('This username is taken.')
  })

  it('does not show the message of a conflict', () => {
    expect(describeError(new ApiError('no enrollment in progress', 409, 'conflict'))).toBe(
      'This is not possible right now.',
    )
  })
})
