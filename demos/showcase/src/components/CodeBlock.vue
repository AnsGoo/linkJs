<script setup lang="ts">
import { ref, watchEffect } from 'vue';
import { highlightToHtml } from '../lib/shiki';

const props = defineProps<{ title?: string; code: string; lang?: string }>();
const html = ref('');

watchEffect(async () => {
  html.value = await highlightToHtml(props.code, props.lang || 'ts');
});
</script>

<template>
  <figure class="code">
    <figcaption v-if="title" class="code-title">
      <span class="dots"><i /><i /><i /></span>
      {{ title }}
    </figcaption>
    <div class="code-body" v-html="html" />
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
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--line);
  color: var(--faint);
  font-size: 11px;
  font-family: var(--mono);
  letter-spacing: 0.02em;
}
.dots {
  display: inline-flex;
  gap: 5px;
}
.dots i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
}
.dots i:first-child {
  background: #ff5f57;
}
.dots i:nth-child(2) {
  background: #febc2e;
}
.dots i:nth-child(3) {
  background: #28c840;
}

.code-body :deep(pre) {
  margin: 0;
  padding: 14px 16px;
  overflow: auto;
  font-size: 12.5px;
  line-height: 1.75;
  background: transparent !important;
}
.code-body :deep(code) {
  font-family: var(--mono);
}
</style>
