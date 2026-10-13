<script setup lang="ts">
import { ref } from 'vue';
import CodeBlock from '../components/CodeBlock.vue';
import { checkRemoteHealth, clearHealthCache, loadLib, selectRemoteSource } from 'linkjs';
import registry from '../registry';

const entry = registry.find((r) => r.name === 'remote-lib-ms')!;
const sources = entry.sources || [];
const health = entry.healthCheck;

const statuses = ref<Record<string, 'unknown' | 'ok' | 'bad'>>({});
const chosen = ref<string>('');
const checks = ref(0);

async function runHealth() {
  clearHealthCache('remote-lib-ms');
  checks.value = 0;
  statuses.value = {};
  for (const s of sources) {
    const ok = await checkRemoteHealth(s, health, 'remote-lib-ms');
    statuses.value[s.host || ''] = ok ? 'ok' : 'bad';
    checks.value++;
  }
}

async function resolveSource() {
  const picked = await selectRemoteSource({ name: 'remote-lib-ms', entry: {}, ...entry }, 'remote-lib-ms');
  chosen.value = picked?.host || '';
}

const loaded = ref(false);
async function load() {
  await loadLib('remote-lib-ms');
  loaded.value = true;
}

const code = `{
  name: 'remote-lib-ms',
  sources: [
    { host: 'http://localhost:4999', labels: { tier: 'canary' } }, // 不可用
    { host: 'http://localhost:4001', labels: { tier: 'stable' } },
  ],
  sourceStrategy: 'first-healthy',
  healthCheck: { path: 'mf/manifest.json', timeout: 1200 },
}`;
</script>

<template>
  <div class="page rise rise-1">
    <header class="head">
      <h1>多源灰度</h1>
      <p class="sub">
        同一远程可声明多个候选源；<code>first-healthy</code> 先探测健康度，跳过不可用源；
        <code>weighted</code> 则在健康源中按权重灰度。
      </p>
    </header>

    <div class="grid">
      <div class="col">
        <CodeBlock title="registry.ts" :code="code" />
        <div class="controls">
          <button class="btn" @click="runHealth">健康检查</button>
          <button class="btn btn-ghost" @click="resolveSource">解析源</button>
          <button class="btn btn-primary" @click="load">按多源加载</button>
        </div>
        <p class="hint mono faint" v-if="checks">已探测 {{ checks }} 个源</p>
      </div>

      <div class="col">
        <ul class="sources">
          <li v-for="s in sources" :key="s.host">
            <div class="src-main">
              <span class="mono host">{{ s.host }}</span>
              <span class="labels">
                <span v-for="(v, k) in s.labels || {}" :key="k" class="pill">{{ k }}={{ v }}</span>
              </span>
            </div>
            <span class="pill" :class="statuses[s.host || ''] === 'ok' ? 'is-loaded' : statuses[s.host || ''] === 'bad' ? 'is-error' : ''">
              <span class="dot" />
              {{ statuses[s.host || ''] === 'ok' ? 'healthy' : statuses[s.host || ''] === 'bad' ? 'unreachable' : 'unknown' }}
            </span>
          </li>
        </ul>
        <p class="chosen mono" v-if="chosen">解析结果 → <b>{{ chosen }}</b></p>
        <p class="faint" v-if="loaded">remote-lib-ms 已从解析到的源加载完成。</p>
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
  max-width: 64ch;
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
  flex-wrap: wrap;
}
.sources {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--line);
}
.sources li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 4px;
  border-bottom: 1px solid var(--line);
}
.src-main {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.host {
  font-size: 13px;
}
.labels {
  display: flex;
  gap: 6px;
}
.chosen {
  font-size: 13px;
  color: var(--muted);
}
.chosen b {
  color: var(--accent);
}
.hint {
  font-size: 12px;
}

@media (max-width: 860px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
