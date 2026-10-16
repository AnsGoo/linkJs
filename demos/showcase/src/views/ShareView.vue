<script setup lang="ts">
import { computed, ref } from 'vue';
import { getInstance, getShare, loadApp, loadShare, loadShareSync } from 'linkjs';
import { createRemoteComponent } from 'linkjs/vue';
import CodeBlock from '../components/CodeBlock.vue';
import { useSnapshot } from '../composables/useSnapshot';

interface KitModule {
  version?: string;
  tag?: string;
  describe?: () => string;
}

type Scope = 'global' | 'tenant-a';

const { snapshot, refresh } = useSnapshot(700);

const strategy = ref(getInstance().shareStrategy);
const scope = ref<Scope>('global');
const remoteReady = ref(false);
const loadingRemote = ref(false);
const hostBusy = ref(false);
const result = ref('');

const Probe = createRemoteComponent('shareRemote/NegotiationProbe');

function linkkitVersions(name = 'linkkit') {
  const rows: Array<{ scope: string; version: string; provider?: string; loaded?: boolean }> = [];
  for (const share of snapshot.value.shares || []) {
    if (share.name !== name) continue;
    for (const v of share.versions) {
      rows.push({ scope: share.scope, version: v.version, provider: v.provider, loaded: v.loaded });
    }
  }
  return rows.sort((a, b) => a.scope.localeCompare(b.scope) || a.version.localeCompare(b.version));
}

const versions = computed(() => linkkitVersions('linkkit'));
const eagerRows = computed(() => linkkitVersions('linkkit-eager'));

async function loadRemote(): Promise<void> {
  loadingRemote.value = true;
  try {
    await loadApp('shareRemote', { shadow: true });
    remoteReady.value = true;
  } catch (error) {
    result.value = `加载远端失败：${String(error)}`;
  } finally {
    loadingRemote.value = false;
  }
}

function setStrategy(value: 'version-first' | 'loaded-first'): void {
  getInstance().shareStrategy = value;
  strategy.value = value;
}

function label(mod: KitModule | null | undefined): string {
  if (!mod) return 'null';
  return `v${mod.version ?? '?'} · ${mod.tag ?? '?'}`;
}

function providerOf(version: string | undefined): string {
  return versions.value.find((v) => v.scope === scope.value && v.version === version)?.provider || '?';
}

function record(op: string, mod: KitModule | null | undefined): void {
  result.value = `${op} → ${label(mod)}（provider: ${providerOf(mod?.version)}）`;
  refresh();
}

async function resolveLatest(): Promise<void> {
  hostBusy.value = true;
  try {
    record(`loadShare('linkkit', { scope: '${scope.value}' })`, (await loadShare('linkkit', { scope: scope.value })) as KitModule | null);
  } finally {
    hostBusy.value = false;
  }
}

async function loadVersion(version: string): Promise<void> {
  hostBusy.value = true;
  try {
    record(
      `loadShare('linkkit', { scope: '${scope.value}', version: '${version}' })`,
      (await loadShare('linkkit', { scope: scope.value, version })) as KitModule | null,
    );
  } finally {
    hostBusy.value = false;
  }
}

function readCurrent(): void {
  record(`getShare('linkkit', { scope: '${scope.value}' })`, getShare('linkkit', { scope: scope.value }) as KitModule | null);
}

function syncRead(): void {
  try {
    record(`loadShareSync('linkkit', { scope: '${scope.value}' })`, loadShareSync('linkkit', { scope: scope.value }) as KitModule | null);
  } catch (error) {
    result.value = `loadShareSync 抛错：${String((error as Error).message || error)}`;
  }
}

async function strictMismatch(): Promise<void> {
  hostBusy.value = true;
  try {
    record(
      "loadShare('linkkit', { requiredVersion: '^9.0.0', strictVersion: true })",
      (await loadShare('linkkit', { scope: scope.value, requiredVersion: '^9.0.0', strictVersion: true })) as KitModule | null,
    );
  } catch (error) {
    result.value = `strictVersion 抛错：${String((error as Error).message || error)}`;
  } finally {
    hostBusy.value = false;
  }
}

async function warnMismatch(): Promise<void> {
  hostBusy.value = true;
  try {
    record(
      "loadShare('linkkit', { requiredVersion: '^9.0.0' })",
      (await loadShare('linkkit', { scope: scope.value, requiredVersion: '^9.0.0' })) as KitModule | null,
    );
  } finally {
    hostBusy.value = false;
  }
}

function resetLoaded(): void {
  const map = getInstance().sharedMap.get(scope.value);
  if (map) {
    // 只清 linkkit 的已加载实例（保留 eager 等其它共享）。
    for (const key of map.keys()) {
      if (key.startsWith('linkkit@')) {
        map.delete(key);
      }
    }
  }
  result.value = `已清空 scope「${scope.value}」的 linkkit 已加载实例（注册表保留）。`;
  refresh();
}

const versionDiagnostics = computed(() => (snapshot.value.diagnostics || []).filter((d) => d.code.includes('SHARE')).slice(0, 6));

const code = `// 宿主注册（showcase/src/main.ts）
createInstance({ shares: {
  linkkit:       { version: '1.0.0', provider: 'host', lib: () => import('./demo-kit/v1') },
  'linkkit-eager': { version: '1.0.0', eager: true, lib: () => import('./demo-kit/v1') }, // 注册即加载
}});

// 远端注入 v2.0.0；多 scope：tenant-a 另有 v3.0.0（与 global 隔离）
registerShare({ linkkit: { version: '3.0.0', scope: 'tenant-a', lib: () => import('./demo-kit/tenant') } });

// 协商 / 同步取已加载
getInstance().shareStrategy = 'version-first' | 'loaded-first';
await loadShare('linkkit', { scope: 'tenant-a', version: '^3.0.0' });
const same = loadShareSync('linkkit'); // 只取已加载；未加载且工厂为异步则抛错`;
</script>

<template>
  <div class="page rise rise-1">
    <header class="head">
      <h1>共享依赖协商</h1>
      <p class="sub">
        同名共享库 <code>linkkit</code> 同时存在多个版本/作用域：宿主 <b>v1.0.0</b>、远端 <code>share-remote</code> 注入的
        <b>v2.0.0</b>、以及 <code>tenant-a</code> 作用域的 <b>v3.0.0</b>。 <code>loadShare</code>/<code>getShare</code> 按
        <code>shareStrategy</code> 协商；本页可切换策略/作用域并观察。
      </p>
    </header>

    <div class="grid">
      <div class="col">
        <section class="panel block">
          <h3 class="sec">协商策略 shareStrategy</h3>
          <div class="seg">
            <button :class="{ on: strategy === 'version-first' }" @click="setStrategy('version-first')">version-first</button>
            <button :class="{ on: strategy === 'loaded-first' }" @click="setStrategy('loaded-first')">loaded-first</button>
          </div>
          <p class="tip">
            <template v-if="strategy === 'version-first'">版本优先：在「已加载 + 可用」候选中取满足条件的最高版本。</template>
            <template v-else>已加载优先：先复用已加载实例，没有满足的才从可用版本加载。</template>
          </p>
        </section>

        <section class="panel block">
          <h3 class="sec">作用域 scope</h3>
          <div class="seg">
            <button :class="{ on: scope === 'global' }" @click="scope = 'global'">global</button>
            <button :class="{ on: scope === 'tenant-a' }" @click="scope = 'tenant-a'">tenant-a</button>
          </div>
          <p class="tip">不同 shareScope 的同名库互不影响：<code>tenant-a</code> 只有 v3.0.0。</p>
        </section>

        <section class="panel block">
          <h3 class="sec">注册表</h3>
          <ul class="versions">
            <li v-for="v in versions" :key="v.scope + v.version">
              <span class="v mono">v{{ v.version }}</span>
              <span class="scope mono faint">{{ v.scope }}</span>
              <span class="pill prov">{{ v.provider }}</span>
              <span class="pill" :class="v.loaded ? 'is-loaded' : ''">{{ v.loaded ? 'loaded' : 'available' }}</span>
            </li>
            <li v-if="!versions.length" class="faint">（未注册）</li>
          </ul>
          <p class="sec sub2">eager（注册即加载）</p>
          <ul class="versions">
            <li v-for="v in eagerRows" :key="v.scope + v.version">
              <span class="v mono">linkkit-eager v{{ v.version }}</span>
              <span class="pill" :class="v.loaded ? 'is-loaded' : ''">{{ v.loaded ? '已自动加载' : '未加载' }}</span>
            </li>
          </ul>
        </section>

        <section class="panel block">
          <h3 class="sec">远端提供方</h3>
          <button class="btn btn-primary" :disabled="loadingRemote" @click="loadRemote">
            {{ remoteReady ? '已加载 share-remote（已注入 v2.0.0）' : '加载 share-remote（注册 linkkit@2.0.0）' }}
          </button>
        </section>
      </div>

      <div class="col">
        <CodeBlock title="注册 / 协商 / 同步" :code="code" />

        <section class="panel block">
          <h3 class="sec">宿主侧操作（scope: {{ scope }}）</h3>
          <div class="controls">
            <button class="btn" :disabled="hostBusy" @click="loadVersion('1.0.0')">加载 v1.0.0</button>
            <button class="btn" :disabled="hostBusy" @click="loadVersion('2.0.0')">加载 v2.0.0</button>
            <button class="btn" :disabled="hostBusy" @click="loadVersion('3.0.0')">加载 v3.0.0</button>
            <button class="btn btn-primary" :disabled="hostBusy" @click="resolveLatest">解析最新版</button>
          </div>
          <div class="controls">
            <button class="btn" :disabled="hostBusy" @click="readCurrent">getShare</button>
            <button class="btn" :disabled="hostBusy" @click="syncRead">loadShareSync（同步）</button>
            <button class="btn" :disabled="hostBusy" @click="resetLoaded">重置已加载</button>
          </div>
          <div class="controls">
            <button class="btn" :disabled="hostBusy" @click="warnMismatch">requiredVersion ^9（告警）</button>
            <button class="btn" :disabled="hostBusy" @click="strictMismatch">strictVersion（抛错）</button>
          </div>
          <p class="result mono">{{ result || '（尚未操作）' }}</p>
        </section>

        <section class="panel block">
          <h3 class="sec">远端侧视角（NegotiationProbe）</h3>
          <component :is="Probe" v-if="remoteReady" />
          <p v-else class="faint">先加载 share-remote，再在此嵌入远端组件，观察远端拿到的同一个共享实例。</p>
        </section>

        <section class="panel block" v-if="versionDiagnostics.length">
          <h3 class="sec">版本诊断</h3>
          <ul class="feed">
            <li v-for="(d, i) in versionDiagnostics" :key="i">
              <span class="tag mono" :class="d.level">{{ d.code }}</span>
              <span class="msg">{{ d.message }}</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
.head {
  max-width: 860px;
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
  grid-template-columns: 0.9fr 1.1fr;
  gap: 24px;
  align-items: start;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
}
.block {
  padding: 16px;
}
.sec {
  font-size: 0.76rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--faint);
  font-family: var(--mono);
  font-weight: 600;
  margin-bottom: 12px;
}
.sub2 {
  margin-top: 16px;
}
.seg {
  display: inline-flex;
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 10px;
}
.seg button {
  background: transparent;
  border: none;
  color: var(--muted);
  font: inherit;
  font-size: 12px;
  padding: 6px 14px;
  cursor: pointer;
}
.seg button.on {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text);
}
.tip {
  margin: 6px 0 0;
  font-size: 12.5px;
  color: var(--muted);
  line-height: 1.6;
}
.tip code {
  color: var(--accent);
}
.versions {
  list-style: none;
  margin: 0;
  padding: 0;
}
.versions li {
  display: grid;
  grid-template-columns: 70px 70px 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 9px 0;
  border-bottom: 1px solid var(--line);
  font-size: 12.5px;
}
.versions li:last-child {
  border-bottom: none;
}
.v {
  color: var(--text);
}
.scope {
  font-size: 11px;
}
.prov {
  color: var(--indigo);
}
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
}
.result {
  margin: 6px 0 0;
  font-size: 12.5px;
  color: var(--text);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px 12px;
  word-break: break-all;
}
.feed {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--line);
}
.feed li {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
  padding: 9px 4px;
  border-bottom: 1px solid var(--line);
  font-size: 12.5px;
  align-items: baseline;
}
.tag {
  color: var(--indigo);
  font-size: 11px;
}
.tag.warn {
  color: var(--amber);
}
.tag.error {
  color: var(--danger);
}
.msg {
  color: var(--muted);
}
@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
