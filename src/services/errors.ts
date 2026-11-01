/** The message of anything that was thrown. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
