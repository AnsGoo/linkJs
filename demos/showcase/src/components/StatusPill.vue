<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ status?: string; type?: string }>();

const statusClass = computed(() => {
  const s = props.status;
  if (s === 'loaded') return 'is-loaded';
  if (s === 'loading') return 'is-loading';
  if (s === 'error') return 'is-error';
  return '';
});
const label = computed(() => {
  const map: Record<string, string> = { loaded: 'loaded', loading: 'loading', unloaded: 'idle', error: 'error' };
  return map[props.status || ''] || props.status || 'unknown';
});
</script>

<template>
  <span class="pill" :class="statusClass">
    <span class="dot" />
    <span>{{ label }}</span>
  </span>
</template>
