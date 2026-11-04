import { ref, watch } from 'vue'
import type { Ref } from 'vue'
import { useRouter } from 'vue-router'
import type { Router } from 'vue-router'

import { useApi } from '@/api'
import type { MovedItem } from '@/api'

/**
 * For views of folders and files: when the tree is loaded and has no item with the route's id,
 * asks `GET /moved/{id}/` and replaces the route with the item's new id (bookmarks and links
 * from before a move). `looking` is true while the answer is pending.
 */
export function useMovedRedirect(
  id: () => string,
  routeName: 'section' | 'resource',
  missing: () => boolean,
): Ref<boolean> {
  const router = useRouter()
  const looking = ref(false)
  watch(
    () => [id(), missing()] as const,
    async ([current, isMissing]) => {
      if (!isMissing || !current) return
      looking.value = true
      try {
        const moved = await useApi().getMoved(current)
        if (moved && moved.item.type === routeName && id() === current)
          await router.replace({ name: routeName, params: { id: moved.item.id } })
      } catch {
        // offline: show "not found"
      } finally {
        if (id() === current) looking.value = false
      }
    },
    { immediate: true },
  )
  return looking
}

/**
 * An open folder or file view follows when its item moved. An open document follows by itself
 * (its session gets `document-renamed` and replaces the route).
 */
export function followMovedRoute(
  router: Router,
  moves: readonly Pick<MovedItem, 'oldId' | 'newId'>[],
): void {
  const { name, params } = router.currentRoute.value
  if ((name !== 'section' && name !== 'resource') || typeof params.id !== 'string') return
  const move = moves.find((m) => m.oldId === params.id)
  if (move) void router.replace({ name, params: { id: move.newId } })
}
