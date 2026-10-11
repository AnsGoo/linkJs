<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { RemoteSnapshot, Snapshot } from '../common/types';
import TopologyGraph from '../components/TopologyGraph.vue';

const props = defineProps<{
  snapshot: Snapshot;
  filter: string;
  onAction: (op: string, arg?: unknown) => void;
}>();

const HOST = '__host__';

const q = computed(() => (props.filter || '').trim().toLowerCase());
const match = (text: unknown) => !q.value || String(text).toLowerCase().includes(q.value);

const remotes = computed(() =>
  (props.snapshot.remotes || []).filter((r) => match(`${r.name} ${r.displayName || ''} ${r.type || ''} ${r.status || ''} ${r.host || ''}`)),
);

const selectedName = ref<string>(HOST);
const isHost = computed(() => selectedName.value === HOST);
const selected = computed<RemoteSnapshot | null>(() => (props.snapshot.remotes || []).find((r) => r.name === selectedName.value) || null);

watch(remotes, () => {
  if (selectedName.value !== HOST && !selected.value) selectedName.value = HOST;
});

// --- HOST（宿主应用）---
const instance = computed(() => props.snapshot.instance || {});
const hostRows = computed(() => {
  const it = instance.value;
  const rows: Array<{ key: string; value: string }> = [];
  const push = (key: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== '') rows.push({ key, value: String(value) });
  };
  push('id', it.id);
  push('name', it.name);
  push('version', it.version);
  push('mode', it.mode);
  push('shareStrategy', it.shareStrategy);
  push('origin', it.origin);
  return rows;
});

// 依赖来源：提供方实体（host / remote 名）+ 加载地址（宿主 origin 或远程 host）。
const shareIndex = computed(() => {
  const map = new Map<string, Array<{ provider: string; version: string; source?: string }>>();
  for (const s of props.snapshot.shares || []) {
    map.set(
      s.name,
      (s.versions || []).map((v) => ({ provider: v.provider || 'host', version: v.version, source: v.source })),
    );
  }
  return map;
});

function addrOf(provider: string): string {
  if (provider === 'host') return props.snapshot.instance?.origin || '宿主（本地）';
  const r = (props.snapshot.remotes || []).find((x) => x.name === provider);
  return r?.host || provider;
}

/** 提供方完整标注：HOST「实例名」/ App「展示名」/ Lib「展示名」。 */
function providerLabel(provider: string): string {
  if (provider === 'host') return `HOST「${props.snapshot.instance?.name || 'host'}」`;
  const r = (props.snapshot.remotes || []).find((x) => x.name === provider);
  if (!r) return provider;
  return `${r.type === 'lib' ? 'Lib' : 'App'}「${r.displayName || r.name}」`;
}

/** 提供方短名（用于拓扑节点）：实例名 / 远程名。 */
function providerTag(provider: string): string {
  if (provider === 'host') return props.snapshot.instance?.name || 'host';
  return provider;
}

interface DepSource {
  provider: string;
  address: string;
}
function depSource(name: string): DepSource | null {
  const list = shareIndex.value.get(name);
  if (!list || !list.length) return null;
  const providers = [...new Set(list.map((x) => x.provider))];
  return { provider: providers.map(providerLabel).join(' + '), address: providers.map(addrOf).join('  ') };
}

interface ProvidedRow {
  name: string;
  detail: string;
}
/** 某实体（host / 远程名）实际注册（提供）的共享依赖及版本。 */
function providedRows(provider: string): ProvidedRow[] {
  const rows: ProvidedRow[] = [];
  for (const s of props.snapshot.shares || []) {
    const vs = (s.versions || []).filter((v) => (v.provider || 'host') === provider);
    if (!vs.length) continue;
    rows.push({ name: s.name, detail: `${s.scope}: ${vs.map((v) => v.version).join(', ')}` });
  }
  return rows;
}
const hostProvided = computed(() => providedRows('host'));
const remoteProvided = computed<ProvidedRow[]>(() => (selected.value ? providedRows(selected.value.name) : []));

const hostTopoEdges = computed<Array<[string, string]>>(() => {
  const edges: Array<[string, string]> = [];
  for (const r of props.snapshot.remotes || []) {
    edges.push(['host', r.name]);
    for (const dep of Object.keys(r.shared || {})) edges.push([r.name, dep]);
  }
  return edges;
});

const hostTopoLabels = computed<Record<string, string>>(() => {
  const labels: Record<string, string> = { host: 'HOST' };
  for (const r of props.snapshot.remotes || []) {
    labels[r.name] = r.name;
    for (const dep of Object.keys(r.shared || {})) {
      const list = shareIndex.value.get(dep);
      const provider = list?.[0]?.provider || 'host';
      labels[dep] = `${dep} (${providerTag(provider)})`;
    }
  }
  return labels;
});

// --- Remote（远程）---
const entryRows = computed(() => {
  const entry = selected.value?.entry;
  if (entry == null) return [];
  if (typeof entry === 'string') return [{ key: 'entry', value: entry }];
  return Object.keys(entry).map((key) => ({ key: `entry.${key}`, value: String((entry as Record<string, unknown>)[key]) }));
});

const metaRows = computed(() => {
  const r = selected.value;
  if (!r) return [];
  const rows: Array<{ key: string; value: string }> = [];
  const push = (key: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== '') rows.push({ key, value: String(value) });
  };
  push('name', r.name);
  push('displayName', r.displayName);
  push('type', r.type);
  push('status', r.status);
  push('host', r.host);
  push('version', r.version);
  push('shareScope', r.shareScope && r.shareScope.length ? r.shareScope.join(', ') : undefined);
  return rows;
});

const integrityKeys = computed(() => Object.keys(selected.value?.integrity || {}));

interface ShareRow {
  name: string;
  summary: string;
  sub: string[];
}
// 声明：完全来自本远程自己的元数据（manifest/registry 的 shared 定义）。
const sharedRows = computed<ShareRow[]>(() => {
  const shared = selected.value?.shared;
  if (!shared) return [];
  return Object.entries(shared).map(([name, raw]) => {
    const cfg = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const parts: string[] = [];
    if (cfg.version) parts.push(`v${cfg.version}`);
    if (cfg.requiredVersion) parts.push(`req ${cfg.requiredVersion}`);
    if (cfg.scope) parts.push(`scope ${cfg.scope}`);
    if (cfg.singleton) parts.push('singleton');
    if (cfg.eager) parts.push('eager');
    if (cfg.strictVersion) parts.push('strict');
    const deps = Array.isArray(cfg.dependencies) ? cfg.dependencies.map((d) => String(d)) : [];
    return { name, summary: parts.join(' · ') || '—', sub: deps };
  });
});

// 运行时解析来源：每个声明的依赖实际命中/来自哪个实体。
interface ResolveRow {
  name: string;
  source: DepSource | null;
}
const resolveRows = computed<ResolveRow[]>(() => {
  const shared = selected.value?.shared;
  if (!shared) return [];
  return Object.keys(shared).map((name) => ({ name, source: depSource(name) }));
});

const topoEdges = computed<Array<[string, string]>>(() => {
  const r = selected.value;
  if (!r) return [];
  const edges: Array<[string, string]> = [];
  for (const row of sharedRows.value) {
    edges.push([r.name, row.name]);
    for (const sub of row.sub) edges.push([row.name, sub]);
  }
  return edges;
});

const topoLabels = computed<Record<string, string>>(() => {
  const labels: Record<string, string> = {};
  const r = selected.value;
  if (!r) return labels;
  labels[r.name] = r.name;
  for (const row of sharedRows.value) {
    const list = shareIndex.value.get(row.name);
    const provider = list?.[0]?.provider || 'host';
    labels[row.name] = `${row.name} (${providerTag(provider)})`;
  }
  return labels;
});
</script>

<template>
  <div class="remote-split">
    <!-- 左栏：HOST + 远程列表（App / Lib） -->
    <aside class="remote-list">
      <h3>宿主 / 远程</h3>
      <button class="remote-item host" :class="{ active: isHost }" @click="selectedName = HOST">
        <span class="pill host">HOST</span>
        <span class="rk">{{ instance.name || 'host' }}</span>
        <span class="pill">{{ (snapshot.remotes || []).length }} 远程</span>
      </button>

      <h3>远程 ({{ remotes.length }})</h3>
      <div v-if="!remotes.length" class="muted">（无）</div>
      <button
        v-for="r in remotes"
        :key="r.name"
        class="remote-item"
        :class="{ active: selectedName === r.name }"
        @click="selectedName = r.name"
      >
        <span class="pill" :class="r.type === 'lib' ? 'lib' : 'app'">{{ r.type === 'lib' ? 'Lib' : 'App' }}</span>
        <span class="rk">{{ r.displayName || r.name }}</span>
        <span class="pill" :class="{ loaded: r.status === 'loaded' }">{{ r.status || '-' }}</span>
      </button>
    </aside>

    <!-- 右栏 -->
    <section class="remote-detail">
      <!-- HOST 详情 -->
      <template v-if="isHost">
        <h3>宿主元数据</h3>
        <div v-for="row in hostRows" :key="row.key" class="row">
          <span class="k">{{ row.key }}</span>
          <span class="v">{{ row.value }}</span>
        </div>

        <h3>HOST 提供的共享依赖 ({{ hostProvided.length }})</h3>
        <div v-if="!hostProvided.length" class="muted">（未提供）</div>
        <div v-for="row in hostProvided" :key="row.name" class="row">
          <span class="k">{{ row.name }}</span>
          <span class="v">{{ row.detail }}</span>
        </div>

        <h3>依赖拓扑（HOST → 远程 → 共享依赖）</h3>
        <div v-if="!hostTopoEdges.length" class="muted">（无远程）</div>
        <TopologyGraph v-else root="host" :edges="hostTopoEdges" :labels="hostTopoLabels" />
      </template>

      <!-- 远程详情 -->
      <template v-else-if="selected">
        <h3>元数据</h3>
        <div v-for="row in metaRows" :key="row.key" class="row">
          <span class="k">{{ row.key }}</span>
          <span class="v">{{ row.value }}</span>
        </div>

        <template v-if="entryRows.length">
          <h3>入口</h3>
          <div v-for="row in entryRows" :key="row.key" class="row">
            <span class="k">{{ row.key }}</span>
            <span class="v">{{ row.value }}</span>
          </div>
        </template>

        <template v-if="integrityKeys.length">
          <h3>SRI ({{ integrityKeys.length }})</h3>
          <div v-for="key in integrityKeys" :key="key" class="row">
            <span class="k" :title="key">{{ key }}</span>
            <span class="v">{{ selected.integrity?.[key] }}</span>
          </div>
        </template>

        <h3>操作</h3>
        <div class="row">
          <span class="k">preload / unload</span>
          <span class="actions">
            <button class="mini" @click="onAction('preload', { name: selected.name })">预取</button>
            <button class="mini" @click="onAction(selected.type === 'lib' ? 'unloadLib' : 'unload', selected.name)">卸载</button>
          </span>
        </div>

        <h3>声明的共享依赖（本远程元数据）({{ sharedRows.length }})</h3>
        <div v-if="!sharedRows.length" class="muted">（该远程未声明共享依赖）</div>
        <div v-for="row in sharedRows" :key="row.name" class="row">
          <span class="k">{{ row.name }}</span>
          <span class="v">{{ row.summary }}</span>
        </div>

        <h3>依赖解析来源 ({{ resolveRows.length }})</h3>
        <div v-if="!resolveRows.length" class="muted">（无）</div>
        <div v-for="row in resolveRows" :key="row.name" class="dep">
          <div class="row">
            <span class="k">{{ row.name }}</span>
            <span class="v">{{ row.source ? row.source.provider : '未解析' }}</span>
          </div>
          <div v-if="row.source" class="dep-source">解析自 {{ row.source.address }}</div>
        </div>

        <h3>本远程提供的共享依赖 ({{ remoteProvided.length }})</h3>
        <div v-if="!remoteProvided.length" class="muted">（未提供，直接使用宿主/其他远程提供的实例）</div>
        <div v-for="row in remoteProvided" :key="row.name" class="row">
          <span class="k">{{ row.name }}</span>
          <span class="v">{{ row.detail }}</span>
        </div>

        <template v-if="sharedRows.length">
          <h3>依赖拓扑</h3>
          <TopologyGraph :root="selected.name" :edges="topoEdges" :labels="topoLabels" />
        </template>
      </template>

      <div v-else class="muted">从左侧选择 HOST 或一个远程查看详情</div>
    </section>
  </div>
</template>
