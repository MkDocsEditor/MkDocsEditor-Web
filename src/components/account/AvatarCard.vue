<script setup lang="ts">
import { mdiDeleteOutline, mdiImageEditOutline } from '@mdi/js'
import { ref } from 'vue'

import { useAuthApi } from '@/api'
import type { AccountInfo } from '@/api'
import UserAvatar from '@/components/common/UserAvatar.vue'
import { avatarUpload } from '@/services/avatarImage'
import { useNotifyStore } from '@/stores/notify'

const props = defineProps<{ account: AccountInfo }>()
const emit = defineEmits<{ changed: [] }>()

const api = useAuthApi()
const notify = useNotifyStore()
const input = ref<HTMLInputElement>()
const busy = ref<'upload' | 'remove' | null>(null)

async function chosen(event: Event): Promise<void> {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  target.value = ''
  if (!file) return
  busy.value = 'upload'
  try {
    const image = await avatarUpload(file)
    if (!image) {
      notify.error('Please choose a JPEG, PNG or WebP picture.')
      return
    }
    await api.setAvatar(image)
    notify.success('Picture saved')
    emit('changed')
  } catch (e) {
    notify.error(e, 'Could not save the picture')
  } finally {
    busy.value = null
  }
}

async function remove(): Promise<void> {
  busy.value = 'remove'
  try {
    await api.deleteAvatar()
    notify.success('Picture removed')
    emit('changed')
  } catch (e) {
    notify.error(e, 'Could not remove the picture')
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <v-card title="Picture" data-testid="avatar-card">
    <v-card-text class="d-flex align-center ga-4">
      <UserAvatar
        :name="props.account.displayName || props.account.username"
        :color="props.account.color"
        :account-id="props.account.id"
        :avatar="props.account.avatar"
        size="72"
        class="text-headline-small"
        data-testid="avatar-preview"
      />
      <p class="text-medium-emphasis">
        Shown next to your name and your cursor. Without one, your initials show in your colour.
      </p>
    </v-card-text>
    <v-card-actions>
      <v-spacer />
      <v-btn
        v-if="props.account.avatar"
        :prepend-icon="mdiDeleteOutline"
        :loading="busy === 'remove'"
        :disabled="busy !== null"
        data-testid="avatar-remove"
        @click="remove"
      >
        Remove
      </v-btn>
      <v-btn
        color="primary"
        variant="flat"
        :prepend-icon="mdiImageEditOutline"
        :loading="busy === 'upload'"
        :disabled="busy !== null"
        data-testid="avatar-upload"
        @click="input?.click()"
      >
        {{ props.account.avatar ? 'Replace' : 'Upload picture' }}
      </v-btn>
      <input
        ref="input"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/*"
        hidden
        data-testid="avatar-input"
        @change="chosen"
      />
    </v-card-actions>
  </v-card>
</template>
