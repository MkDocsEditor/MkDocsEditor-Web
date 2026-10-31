<script setup lang="ts">
import { computed } from 'vue'

import type { OnlineUser } from '@/services/events'
import { initials } from '@/services/names'

const props = withDefaults(defineProps<{ users: OnlineUser[]; max?: number; size?: number }>(), {
  max: 3,
  size: 24,
})

const shown = computed(() => props.users.slice(0, props.max))
const more = computed(() => props.users.length - shown.value.length)
const label = computed(
  () => `Gerade geöffnet von ${props.users.map((u) => u.displayName).join(', ')}`,
)
</script>

<template>
  <v-avatar-group
    v-if="users.length > 0"
    :title="label"
    :aria-label="label"
    role="img"
    data-testid="online-avatars"
  >
    <v-avatar
      v-for="user in shown"
      :key="user.username"
      :color="user.color ?? 'grey'"
      :size="size"
      class="text-white online-avatars__avatar"
    >
      {{ initials(user.displayName) }}
    </v-avatar>
    <v-avatar v-if="more > 0" :size="size" color="grey-lighten-1" class="online-avatars__avatar">
      +{{ more }}
    </v-avatar>
  </v-avatar-group>
</template>

<style scoped>
.online-avatars__avatar {
  font-size: 0.65rem;
  font-weight: 600;
}
</style>
