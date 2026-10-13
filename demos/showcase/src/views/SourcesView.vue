<script setup lang="ts">
import { computed, ref } from 'vue';
import CodeBlock from '../components/CodeBlock.vue';
import { checkRemoteHealth, clearHealthCache, loadLib, selectRemoteSource } from 'linkjs';
import registry from '../registry';

const entry = registry.find((r) => r.name === 'remote-lib')!;
const sources = entry.sources || [];
const health = entry.healthCheck;

const statuses = ref<Record<string, 'unknown' | 'ok' | 'bad'>>({});
const chosen = ref<string>('');
const checks = ref(0);
const busy = ref(false);
const error = ref('');

async function runHealth() {
  busy.value = true;
  error.value = '';
  clearHealthCache('remote-lib');
  checks.value = 0;
  statuses.value = {};
  try {
    for (const s of sources) {
      const ok = await checkRemoteHealth(s, health, 'remote-lib');
      statuses.value[s.host || ''] = ok ? 'ok' : 'bad';
      checks.value++;
    }
  } finally {
    busy.value = false;
  }
}

async function resolveSource() {
  busy.value = true;
  error.value = '';
  try {
    const picked = await selectRemoteSource({ name: 'remote-lib', entry: {}, ...entry }, 'remote-lib');
    chosen.value = picked?.host || '';
  } finally {
    busy.value = false;
  }
}

const loaded = ref(false);
async function load() {
  busy.value = true;
  error.value = '';
  try {
    await loadLib('remote-lib');
    loaded.value = true;
  } catch (e) {
    error.value = (e as Error)?.message || String(e);
  } finally {
    busy.value = false;
  }
}

// weighted 灰度抽样：跳过健康检查，按 weight 随机挑选，统计分布。
const samples = ref<Record<string, number>>({});
const rounds = ref(0);
async function sampleWeighted(times = 60) {
  busy.value = true;
  try {
    const tally: Record<string, number> = {};
    for (let i = 0; i < times; i++) {
      const picked = await selectRemoteSource({ name: 'remote-lib', entry: {}, ...entry }, 'remote-lib', {
        strategy: 'weighted',
        skipHealthCheck: true,
      });
      const h = picked?.host || '?';
      tally[h] = (tally[h] || 0) + 1;
    }
    samples.value = tally;
    rounds.value = times;
  } finally {
    busy.value = false;
  }
}
const distribution = computed(() =>
  sources.map((s) => ({
    host: s.host || '',
    weight: s.weight ?? 1,
    count: samples.value[s.host || ''] || 0,
    pct: rounds.value ? Math.round(((samples.value[s.host || ''] || 0) / rounds.value) * 100) : 0,
  })),
);

const code = `{
  name: 'remote-lib',
  sources: [
    { host: 'http://localhost:4999', weight: 1, labels: { tier: 'canary' } }, // 不可用
    { host: 'http://localhost:4001', weight: 3, labels: { tier: 'stable' } },
  ],
  sourceStrategy: 'first-healthy',   // 或 'weighted'
  healthCheck: { path: 'mf/manifest.json', timeout: 900 },
}`;
</script>

<template>
  <div class="page rise rise-1">
    <header class="head">
      <h1>多源灰度</h1>
      <p class="sub">
        同一远程可声明多个候选源；<code>first-healthy</code> 先探测健康度、跳过不可用源；
        <code>weighted</code> 则在健康源中按 <code>weight</code> 随机挑选（灰度）。
      </p>
    </header>

    <div class="grid">
      <div class="col">
        <CodeBlock title="registry.ts" lang="ts" :code="code" />
        <div class="controls">
          <button class="btn" :disabled="busy" @click="runHealth">健康检查</button>
          <button class="btn btn-ghost" :disabled="busy" @click="resolveSource">解析源</button>
          <button class="btn btn-primary" :disabled="busy" @click="load">按多源加载</button>
        </div>
        <p v-if="error" class="error mono">{{ error }}</p>
        <p class="hint mono faint" v-if="checks">已探测 {{ checks }} 个源</p>
        <p class="chosen mono" v-if="chosen">解析结果 → <b>{{ chosen }}</b></p>
        <p class="faint" v-if="loaded">remote-lib 已从解析到的源加载完成。</p>
      </div>

      <div class="col">
        <ul class="sources">
          <li v-for="s in sources" :key="s.host">
            <div class="src-main">
              <span class="mono host">{{ s.host }}</span>
              <span class="labels">
                <span v-for="(v, k) in s.labels || {}" :key="k" class="pill">{{ k }}={{ v }}</span>
                <span class="pill">weight {{ s.weight ?? 1 }}</span>
              </span>
            </div>
            <span class="pill" :class="statuses[s.host || ''] === 'ok' ? 'is-loaded' : statuses[s.host || ''] === 'bad' ? 'is-error' : ''">
              <span class="dot" />
              {{ statuses[s.host || ''] === 'ok' ? 'healthy' : statuses[s.host || ''] === 'bad' ? 'unreachable' : 'unknown' }}
            </span>
          </li>
        </ul>
      </div>
    </div>

    <section class="weighted">
      <div class="w-head">
        <h3 class="sec">weighted 灰度抽样</h3>
        <div class="controls">
          <button class="btn" :disabled="busy" @click="sampleWeighted(60)">抽样 ×60</button>
          <button class="btn" :disabled="busy" @click="sampleWeighted(300)">抽样 ×300</button>
        </div>
      </div>
      <div class="bars">
        <div v-for="d in distribution" :key="d.host" class="bar-row">
          <span class="mono bar-host">{{ d.host }}</span>
          <span class="bar-track"><span class="bar-fill" :style="{ transform: `scaleX(${d.pct / 100})` }" /></span>
          <span class="mono tnum bar-val">{{ d.count }} · {{ d.pct }}% (w{{ d.weight }})</span>
        </div>
      </div>
      <p class="faint note">抽样跳过健康检查，仅演示按 weight 的分布（≈ 权重比）。</p>
    </section>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 26px;
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
  max-width: 66ch;
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
  flex-wrap: wrap;
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
.error {
  color: var(--danger);
  font-size: 12.5px;
  padding: 10px 12px;
  border: 1px solid color-mix(in oklab, var(--danger) 30%, transparent);
  border-radius: var(--radius-sm);
}
.weighted {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.w-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.sec {
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--faint);
  font-family: var(--mono);
  font-weight: 600;
}
.bars {
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-top: 1px solid var(--line);
  padding-top: 16px;
}
.bar-row {
  display: grid;
  grid-template-columns: 190px 1fr 170px;
  gap: 16px;
  align-items: center;
  font-size: 12.5px;
}
.bar-host {
  font-size: 12px;
}
.bar-track {
  height: 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  overflow: hidden;
}
.bar-fill {
  display: block;
  height: 100%;
  width: 100%;
  border-radius: 999px;
  transform-origin: left;
  transform: scaleX(0);
  background: linear-gradient(90deg, var(--accent), var(--indigo));
  transition: transform 0.5s var(--ease);
}
.bar-val {
  color: var(--muted);
  text-align: right;
}
.note {
  font-size: 12px;
}
@media (max-width: 860px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .bar-row {
    grid-template-columns: 1fr;
    gap: 6px;
  }
}
</style>
