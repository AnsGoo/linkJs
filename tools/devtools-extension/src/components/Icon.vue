<script setup lang="ts">
defineProps<{ name: 'home' | 'remote' }>();
</script>

<template>
  <span class="ico">
    <svg v-if="name === 'home'" viewBox="0 0 24 24">
      <path d="M12 3 3 10.5V21h6v-6h6v6h6V10.5z" />
    </svg>
    <svg v-else viewBox="0 0 24 24">
      <rect x="4" y="4" width="16" height="6" rx="2" />
      <rect x="4" y="14" width="16" height="6" rx="2" />
    </svg>
  </span>
</template>
