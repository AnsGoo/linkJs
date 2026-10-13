<script setup lang="ts">
defineProps<{ title?: string }>();
</script>

<template>
  <figure class="code">
    <figcaption v-if="title" class="code-title">{{ title }}</figcaption>
    <pre><code><slot /></code></pre>
  </figure>
</template>

<style scoped>
.code {
  margin: 0;
  background: #090b10;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.code-title {
  padding: 8px 12px;
  border-bottom: 1px solid var(--line);
  color: var(--faint);
  font-size: 11px;
  font-family: var(--mono);
  letter-spacing: 0.02em;
}
pre {
  margin: 0;
  padding: 14px 16px;
  overflow: auto;
  font-size: 12.5px;
  line-height: 1.7;
  color: #cdd4e4;
}
</style>
