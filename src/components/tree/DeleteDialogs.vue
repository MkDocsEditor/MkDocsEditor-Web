<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { ApiError } from '@/api'
import type { TreeItem } from '@/api'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import { useBreakWarning } from '@/components/references/backlinks'
import { ITEM_LABELS } from '@/services/names'
import { useItemActionsStore } from '@/stores/itemActions'
import { useNotifyStore } from '@/stores/notify'
import { useTreeStore } from '@/stores/tree'

/** The delete confirmation of `useItemActionsStore`, once for the whole app. */
const actions = useItemActionsStore()
const tree = useTreeStore()
const notify = useNotifyStore()
const route = useRoute()
const router = useRouter()

/** Kept while the dialog closes, so its text does not change on the way out. */
const shown = ref<TreeItem | null>(null)
watch(
  () => actions.deleting,
  (item) => {
    if (item) shown.value = item
  },
)
const deleteOpen = computed({
  get: () => actions.deleting !== null,
  set: (open: boolean) => {
    if (!open) actions.deleting = null
  },
})
// Deleting a page somebody has open fails with 409; the user can then force it.
const forcing = ref<TreeItem | null>(null)
const forceOpen = computed({
  get: () => forcing.value !== null,
  set: (open: boolean) => {
    if (!open) forcing.value = null
  },
})

/** Whether the open page is `item`, or lies inside it. */
function shows(item: TreeItem): boolean {
  const id = route.params.id
  if (!['section', 'document', 'resource'].includes(String(route.name))) return false
  if (typeof id !== 'string') return false
  return id === item.id || tree.ancestors(id).some((a) => a.id === item.id)
}

function isInUse(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409
}

async function deleteItem(item: TreeItem, force: boolean): Promise<void> {
  if (item.type === 'section') await tree.deleteSection(item.id, force)
  else if (item.type === 'document') await tree.deleteDocument(item.id, force)
  else await tree.deleteResource(item.id)
}

/** How long the server may take to notice that our own editor closed. */
const CLOSE_GRACE_MS = 500

async function remove(item: TreeItem | null, force = false): Promise<void> {
  if (!item) return
  // Leave first: the own editor of the page would count as someone who has it open. Read the
  // parent before, afterwards the tree no longer has the item.
  if (shows(item)) {
    const parent = tree.parentOf(item.id)?.id
    await router.replace(
      parent && parent !== tree.root?.id
        ? { name: 'section', params: { id: parent } }
        : { name: 'files' },
    )
  }
  try {
    try {
      await deleteItem(item, force)
    } catch (error) {
      if (force || !isInUse(error)) throw error
      // the close of the own connection may not have arrived yet
      await new Promise((resolve) => setTimeout(resolve, CLOSE_GRACE_MS))
      await deleteItem(item, force)
    }
    notify.success(`Deleted “${item.name}”`)
  } catch (error) {
    if (!force && isInUse(error)) forcing.value = item
    else notify.error(error, 'Delete failed', () => void remove(item, force))
  }
}

const target = shown
const deleteWarning = useBreakWarning(() => actions.deleting)
const title = computed(() => (target.value ? `Delete ${ITEM_LABELS[target.value.type]}?` : ''))
const text = computed(() => {
  const item = target.value
  if (!item) return ''
  const base =
    item.type === 'section'
      ? `The folder “${item.name}” is deleted with everything in it, for everyone.`
      : `“${item.name}” will be deleted for everyone.`
  return deleteWarning.value ? `${base} ${deleteWarning.value}` : base
})

function confirm(): void {
  void remove(target.value)
}
</script>

<template>
  <ConfirmDialog
    v-model="deleteOpen"
    :title="title"
    :text="text"
    confirm-text="Delete"
    danger
    @confirm="confirm"
  />
  <ConfirmDialog
    v-model="forceOpen"
    title="Being edited right now"
    text="Someone has this open right now. If you delete it anyway, they get a notice and can still copy their text."
    confirm-text="Delete anyway"
    danger
    @confirm="remove(forcing, true)"
  />
</template>
