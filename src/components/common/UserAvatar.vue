<script setup lang="ts">
import { ref, watchEffect } from 'vue'

import { avatarUrl, loadedAvatarUrl } from '@/services/avatars'
import { initials as initialsOf } from '@/services/names'

const props = withDefaults(
  defineProps<{
    /** Display name, or what the initials come from. */
    name: string
    color?: string
    accountId?: string
    avatar?: string | null
    size?: number | string
  }>(),
  { color: 'grey', accountId: undefined, avatar: undefined, size: 32 },
)

/** The picture, or nothing while it loads, when there is none, or when it failed. */
const url = ref<string | undefined>()

watchEffect((onCleanup) => {
  const owner = { accountId: props.accountId, avatar: props.avatar }
  url.value = loadedAvatarUrl(owner)
  if (url.value) return
  let current = true
  onCleanup(() => (current = false))
  void avatarUrl(owner)
    ?.then((u) => {
      if (current) url.value = u
    })
    .catch(() => undefined)
})
</script>

<template>
  <v-avatar :color="url ? undefined : color" :size="size" class="user-avatar">
    <img v-if="url" :src="url" alt="" class="user-avatar__image" data-testid="avatar-image" />
    <span v-else class="user-avatar__initials">{{ initialsOf(name) }}</span>
    <slot />
  </v-avatar>
</template>

<style scoped>
.user-avatar__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.user-avatar__initials {
  color: white;
}
</style>
