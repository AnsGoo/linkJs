<script setup lang="ts">
// 自绘 SVG 图标集（统一 24 视框、1.6 描边、圆头），不依赖图标库。
defineProps<{ name: string }>();

const paths: Record<string, string[]> = {
  grid: ['M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'],
  zap: ['M13 2 4 14h6l-1 8 9-12h-6z'],
  link: [
    'M9.5 14.5 14.5 9.5',
    'M8 12 6 14a3.5 3.5 0 0 0 5 5l2-2',
    'M16 12l2-2a3.5 3.5 0 0 0-5-5l-2 2',
  ],
  flow: ['M6 6h5a3 3 0 0 1 3 3v0a3 3 0 0 0 3 3h1', 'M6 6v12', 'M4 6h4M8 12h2', 'M18 12h2'],
  activity: ['M3 12h4l3 8 4-16 3 8h4'],
  play: ['M7 4.5v15l13-7.5z'],
  unplug: ['M9 7V3M15 7V3', 'M7 7h10v4a5 5 0 0 1-10 0z', 'M12 16v5'],
  box: ['M12 3 3 7.5v9L12 21l9-4.5v-9z', 'M3 7.5 12 12l9-4.5', 'M12 12v9'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  spark: ['M12 2v4M12 18v4M2 12h4M18 12h4', 'M5 5l2.6 2.6M16.4 16.4 19 19M19 5l-2.6 2.6M7.6 16.4 5 19'],
  download: ['M12 3v11', 'M7.5 10.5 12 15l4.5-4.5', 'M4 19h16'],
  network: ['M12 3v4', 'M5 21v-4', 'M19 21v-4', 'M5 17h14', 'M12 7l7 6', 'M12 7 5 13'],
  share: ['M7 8h10', 'M14 5l3 3-3 3', 'M17 16H7', 'M10 13l-3 3 3 3'],
  shield: ['M12 3 5 6v6c0 4 3 7 7 9 4-2 7-5 7-9V6z', 'M9.5 12.5l1.8 1.8 3.4-3.6'],
};
</script>

<template>
  <svg
    class="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path v-for="(d, i) in paths[name] || []" :key="i" :d="d" />
  </svg>
</template>

<style scoped>
.icon {
  width: 18px;
  height: 18px;
  display: block;
}
</style>
