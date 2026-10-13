<script setup lang="ts">
import { computed, ref } from 'vue';
import CodeBlock from '../components/CodeBlock.vue';
import { globalSnapshot, loadApp, preloadRemote, remoteSnapshot } from 'linkjs';

const busy = ref(false);
const error = ref('');
const version = ref(0);
const reveal = ref(false);
const loadedOnce = ref(false);
const notice = ref('');
const timing = ref<{ lazy?: number; prefetched?: number }>({});

const snap = computed(() => {
  void version.value;
  return remoteSnapshot('remote-lib');
});
const all = computed(() => {
  void version.value;
  return globalSnapshot();
});
const records = computed(() => Object.values(all.value.remotes));

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

/** 冷加载（未预取）：直接 loadApp 计时。仅首次有效——模块加载后会被浏览器缓存。 */
async function loadLazy() {
  if (loadedOnce.value) {
    notice.value = '已冷加载过：远端模块已被浏览器缓存，冷测需刷新页面。';
    return;
  }
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const t = performance.now();
    await loadApp('remoteApp');
    timing.value = { ...timing.value, lazy: Math.round(performance.now() - t) };
    loadedOnce.value = true;
    version.value++;
  } catch (e) {
    error.value = (e as Error)?.message || String(e);
  } finally {
    busy.value = false;
  }
}

/** 预取后加载：先 preloadRemote 预热，再 loadApp 计时（已加载则命中缓存，近乎 0ms）。 */
async function loadPrefetched() {
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    await preloadRemote({
      name: 'remoteApp',
      host: 'http://localhost:8081',
      manifestUrl: 'http://localhost:8081/manifest.json',
      prefetch: true,
      force: true,
    });
    const t = performance.now();
    await loadApp('remoteApp');
    timing.value = { ...timing.value, prefetched: Math.round(performance.now() - t) };
    loadedOnce.value = true;
    version.value++;
  } catch (e) {
    error.value = (e as Error)?.message || String(e);
  } finally {
    busy.value = false;
  }
}

const code = `import { preloadRemote } from 'linkjs';

// 路由守卫 / hover 时触发，预热远端 manifest 与资源
await preloadRemote({
  name: 'remote-lib',
  host: 'http://localhost:4001',
  prefetch: true,   // 连同 exposes 的异步资源一起预热
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
            {{ busy ? '处理中…' : '预取 remote-lib 资源' }}
          </button>
        </div>
        <p v-if="error" class="error mono">{{ error }}</p>
        <p v-if="notice" class="notice">{{ notice }}</p>

        <h3 class="sec">首屏耗时对比（loadApp）</h3>
        <div class="compare">
          <div class="cmp">
            <span class="cmp-k">未预取</span>
            <span class="cmp-v mono tnum">{{ timing.lazy != null ? timing.lazy + ' ms' : '—' }}</span>
            <button class="btn btn-ghost" :disabled="busy" @click="loadLazy">测一次</button>
          </div>
          <div class="cmp">
            <span class="cmp-k">预取后</span>
            <span class="cmp-v mono tnum">{{ timing.prefetched != null ? timing.prefetched + ' ms' : '—' }}</span>
            <button class="btn btn-ghost" :disabled="busy" @click="loadPrefetched">测一次</button>
          </div>
        </div>
      </div>

      <div class="col">
        <div class="panel stat">
          <div class="row"><span class="faint mono">remote-lib.prefetched</span><span class="mono tnum">{{ snap?.prefetched ? 'yes' : 'no' }}</span></div>
          <div class="row"><span class="faint mono">remote-lib.assets</span><span class="mono tnum">{{ snap?.assets?.length || 0 }}</span></div>
          <div class="row"><span class="faint mono">globalSnapshot.version</span><span class="mono tnum">{{ all.version }}</span></div>
        </div>

        <h3 class="sec">预取记录</h3>
        <ul class="records">
          <li v-for="r in records" :key="r.name">
            <span class="mono r-name">{{ r.name }}</span>
            <span class="mono faint">{{ r.manifestUrl?.replace(/^https?:\/\//, '') }}</span>
            <span class="mono tnum">{{ r.assets?.length || 0 }} assets</span>
          </li>
          <li v-if="!records.length" class="faint empty">预取后列出记录。</li>
        </ul>
        <ul class="assets" v-if="reveal && snap?.assets?.length">
          <li v-for="a in snap.assets" :key="a" class="mono">{{ a.replace('http://localhost:4001', '') }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 26px;
}
.head {
  max-width: 760px;
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
.sec {
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--faint);
  font-family: var(--mono);
  font-weight: 600;
  margin: 6px 0 0;
}
.compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.cmp {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
}
.cmp-k {
  color: var(--muted);
  font-size: 12.5px;
}
.cmp-v {
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.cmp .btn {
  align-self: flex-start;
  height: 30px;
  padding: 0 12px;
  font-size: 12px;
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
.records,
.assets {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--line);
}
.records li,
.assets li {
  display: grid;
  gap: 12px;
  padding: 9px 4px;
  border-bottom: 1px solid var(--line);
  font-size: 12px;
  color: var(--muted);
}
.records li {
  grid-template-columns: 110px 1fr 90px;
}
.assets {
  margin-top: 8px;
}
.error {
  color: var(--danger);
  font-size: 12.5px;
  padding: 10px 12px;
  border: 1px solid color-mix(in oklab, var(--danger) 30%, transparent);
  border-radius: var(--radius-sm);
}
.notice {
  color: var(--amber);
  font-size: 12.5px;
  line-height: 1.6;
}
.empty {
  font-size: 13px;
}
@media (max-width: 860px) {
  .grid,
  .compare {
    grid-template-columns: 1fr;
  }
}
</style>
