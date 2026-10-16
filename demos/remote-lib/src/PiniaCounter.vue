<script setup lang="ts">
import { defineStore } from 'pinia';
import { ref } from 'vue';

// 该组件使用 pinia（+ vue），因此其 expose 的 deps.shared 应含 vue、pinia；
// 对照 VerySimpleComponent（仅 vue），用于演示“按 expose 的依赖差异”。
const useCounter = defineStore('lib-counter', () => {
  const n = ref(0);
  const inc = () => {
    n.value += 1;
  };
  return { n, inc };
});

const counter = useCounter();
</script>

<template>
  <button class="pinia-counter" type="button" @click="counter.inc()">remote-lib pinia counter: {{ counter.n }}</button>
</template>
