<script setup lang="ts">
import { computed, ref } from 'vue';
import CodeBlock from '../components/CodeBlock.vue';
import { globalSnapshot, preloadRemote, remoteSnapshot } from 'linkjs';

const busy = ref(false);
const error = ref('');
const version = ref(0);
const reveal = ref(false);

const snap = computed(() => {
  void version.value;
  return remoteSnapshot('remote-lib');
});
const all = computed(() => {
  void version.value;
  return globalSnapshot();
});

async function preload() {
  busy.value = true;
  error.value = '';
  try {
    await preloadRemote({
      name: 'remote-lib',
      host: 'http://localhost:4001',
      manifestUrl: 'http://localhost:4001/mf/manifest.json',
      prefetch: true,
      force: true,
    });
    version.value++;
    reveal.value = true;
  } catch (e) {
    error.value = (e as Error)?.message || String(e);
  } finally {
    busy.value = false;
  }
}

const code = `import { preloadRemote } from 'linkjs';

// 路由守卫 / hover 时触发
await preloadRemote({
  name: 'remote-lib',
  host: 'http://localhost:4001',
  manifestUrl: 'http://localhost:4001/mf/manifest.json',
  prefetch: true,   // 连同 exposes 的异步资源一起预热
  force: true,
});`;
</script>

<template>
  <div class="page rise rise-1">
    <header class="head">
      <h1>路由级预取</h1>
      <p class="sub">
        在进入某路由**之前**用 <code>preloadRemote</code> 拉取远端 manifest 并预热 JS/CSS，
        使真正 <code>loadApp</code> 时命中缓存、瞬间完成。
      </p>
    </header>

    <div class="grid">
      <div class="col">
        <CodeBlock title="PreloadView.vue" :code="code" />
        <div class="controls">
          <button class="btn btn-primary" :disabled="busy" @click="preload">
            {{ busy ? '预取中…' : '预取 remote-lib' }}
          </button>
        </div>
        <p v-if="error" class="error mono">{{ error }}</p>
      </div>

      <div class="col">
        <div class="panel stat">
          <div class="row">
            <span class="faint mono">prefetched</span>
            <span class="mono tnum">{{ snap?.prefetched ? 'yes' : 'no' }}</span>
          </div>
          <div class="row">
            <span class="faint mono">assets</span>
            <span class="mono tnum">{{ snap?.assets?.length || 0 }}</span>
          </div>
          <div class="row">
            <span class="faint mono">globalSnapshot.version</span>
            <span class="mono tnum">{{ all.version }}</span>
          </div>
        </div>

        <ul class="assets" v-if="reveal && snap?.assets?.length">
          <li v-for="a in snap.assets" :key="a" class="mono">{{ a.replace('http://localhost:4001', '') }}</li>
        </ul>
        <p v-else class="faint empty">点击「预取 remote-lib」后列出预热的资源。</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 28px;
}
.head {
  max-width: 720px;
}
.head code,
.sub code {
  background: rgba(255, 255, 255, 0.06);
  padding: 1px 6px;
  border-radius: 5px;
  font-size: 0.85em;
  color: var(--accent);
}
.sub {
  margin-top: 14px;
  color: var(--muted);
  line-height: 1.7;
}
.grid {
  display: grid;
  grid-template-columns: 1.05fr 0.95fr;
  gap: 24px;
  align-items: start;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.controls {
  display: flex;
  gap: 10px;
}
.stat {
  padding: 6px 16px;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
}
.row:last-child {
  border-bottom: none;
}
.assets {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--line);
}
.assets li {
  padding: 8px 4px;
  border-bottom: 1px solid var(--line);
  font-size: 12px;
  color: var(--muted);
}
.error {
  color: var(--danger);
  font-size: 12.5px;
  padding: 10px 12px;
  border: 1px solid color-mix(in oklab, var(--danger) 30%, transparent);
  border-radius: var(--radius-sm);
}
.empty {
  font-size: 13px;
}

@media (max-width: 860px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
