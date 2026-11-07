<script setup lang="ts">
import { startPage } from '@/composables/preferences'

import DashboardView from './DashboardView.vue'
import SectionView from './SectionView.vue'
</script>

<template>
  <DashboardView v-if="startPage === 'dashboard'" />
  <SectionView v-else />
</template>
