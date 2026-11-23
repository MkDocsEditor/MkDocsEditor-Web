import type { ScrollAnchor } from '@/markdown/sourceLines'
import { local, readJson, remove, writeJson } from '@/services/storage'

import { accountKey } from './account'

/** How many documents keep their view; the ones looked at longest ago go first. */
export const VIEW_LIMIT = 100

/**
 * Where a document was left on this device: the selection, and how far each pane was scrolled.
 * Not synced. Positions are UTF-16 indexes of the text then; `length` is its length.
 */
export interface DocumentView {
  selection: { anchor: number; head: number }[]
  /** The main range of `selection`. */
  main: number
  /** The reading place of the editor, when it was on screen. */
  editor?: ScrollAnchor
  /** The reading place of the preview, when it was on screen. */
  preview?: ScrollAnchor
  length: number
  savedAt: number
}

type Views = Record<string, DocumentView>

/** Per account: the next user of this browser must not land where the last one was. */
function keyOf(account: string): string {
  return `mkdocseditor.documentViews.${account}`
}

function isAnchor(value: unknown): value is ScrollAnchor {
  const a = value as ScrollAnchor | undefined
  return typeof a?.line === 'number' && typeof a.at === 'number'
}

function isView(value: unknown): value is DocumentView {
  const v = value as DocumentView | undefined
  return (
    !!v &&
    Array.isArray(v.selection) &&
    v.selection.length > 0 &&
    v.selection.every((r) => typeof r?.anchor === 'number' && typeof r.head === 'number') &&
    typeof v.main === 'number' &&
    typeof v.length === 'number' &&
    typeof v.savedAt === 'number' &&
    (v.editor === undefined || isAnchor(v.editor)) &&
    (v.preview === undefined || isAnchor(v.preview))
  )
}

function load(): Views {
  const stored = readJson<unknown>(local(), keyOf(accountKey()))
  if (!stored || typeof stored !== 'object') return {}
  return Object.fromEntries(Object.entries(stored).filter(([, view]) => isView(view)))
}

function save(views: Views): void {
  const kept = Object.entries(views)
    .sort(([, a], [, b]) => b.savedAt - a.savedAt)
    .slice(0, VIEW_LIMIT)
  writeJson(local(), keyOf(accountKey()), Object.fromEntries(kept))
}

export function rememberView(id: string, view: Omit<DocumentView, 'savedAt'>): void {
  save({ ...load(), [id]: { ...view, savedAt: Date.now() } })
}

/** The view a document was left in, fitted into a text of `length`: it may have changed since. */
export function recallView(id: string, length: number): DocumentView | null {
  const view = load()[id]
  if (!view) return null
  const clamp = (n: number) => Math.max(0, Math.min(length, n))
  const selection = view.selection.map((r) => ({ anchor: clamp(r.anchor), head: clamp(r.head) }))
  return { ...view, selection, main: Math.min(Math.max(0, view.main), selection.length - 1) }
}

/** A document got another id (moved or renamed). */
export function moveView(oldId: string, newId: string): void {
  const views = load()
  const view = views[oldId]
  if (!view) return
  delete views[oldId]
  views[newId] = view
  save(views)
}

/** Forgets the views of documents that are gone. */
export function forgetViews(exists: (id: string) => boolean): void {
  const views = load()
  const kept = Object.fromEntries(Object.entries(views).filter(([id]) => exists(id)))
  if (Object.keys(kept).length !== Object.keys(views).length) save(kept)
}

export function clearViews(account: string): void {
  remove(local(), keyOf(account))
}
