<script setup lang="ts">
import { computed } from 'vue';
import type { Snapshot } from '../common/types';
import { displayMap, kindLabel, ms, perfLabel, prettyEntry, remoteLabel, timeStr } from '../common/format';

const props = defineProps<{
  snapshot: Snapshot;
  filter: string;
  onAction: (op: string, arg?: unknown) => void;
}>();

const q = computed(() => (props.filter || '').trim().toLowerCase());
const match = (text: unknown) => !q.value || String(text).toLowerCase().includes(q.value);
const show = (text: unknown) => !q.value || String(text).toLowerCase().includes(q.value);

const map = computed(() => displayMap(props.snapshot.remotes));

const remotes = computed(() =>
  (props.snapshot.remotes || []).filter((r) => match(`${r.name} ${r.displayName || ''} ${r.type || ''} ${r.status || ''} ${r.host || ''}`)),
);
const shareRows = computed(() =>
  (props.snapshot.shares || []).flatMap((share) =>
    share.versions
      .filter((v) => match(`${share.name} ${share.scope} ${v.version}`))
      .map((v) => ({ key: `${share.scope}:${share.name}:${v.version}`, name: share.name, scope: share.scope, v })),
  ),
);
const conflicts = computed(() => (props.snapshot.conflicts || []).filter((c) => match(`${c.name} ${c.requiredVersion}`)));
const plugins = computed(() => {
  const all = props.snapshot.availablePlugins || [];
  return { list: all.filter((p) => show(p.name)), enabled: all.filter((p) => p.enabled).length, total: all.length };
});
const metrics = computed(() =>
  (props.snapshot.metrics || [])
    .filter((m) => match(`${m.entry} ${m.status} ${m.host || ''}`))
    .slice(-12)
    .reverse(),
);
const perf = computed(() =>
  (props.snapshot.perf || [])
    .filter((p) => show(p.name))
    .slice(-12)
    .reverse(),
);
const events = computed(() =>
  (props.snapshot.events || [])
    .filter((e) => match(`${e.type} ${e.summary}`))
    .slice(-20)
    .reverse(),
);
const diagnostics = computed(() =>
  (props.snapshot.diagnostics || [])
    .filter((d) => match(`${d.code} ${d.message}`))
    .slice(-20)
    .reverse(),
);
</script>

<template>
  <h3>远程应用</h3>
  <div v-if="!remotes.length" class="muted">（无）</div>
  <div v-for="r in remotes" :key="r.name" class="row">
    <span class="k" :title="`${r.name}${r.host ? ' @' + r.host : ''}`">{{ remoteLabel(r) }}</span>
    <span class="actions">
      <span class="pill" :class="{ loaded: r.status === 'loaded' }">{{ r.status || '-' }}</span>
      <button class="mini" title="按 manifest 预取资源" @click="onAction('preload', { name: r.name })">预取</button>
      <button
        class="mini"
        :title="r.type === 'lib' ? '卸载远程库' : '卸载远程应用'"
        @click="onAction(r.type === 'lib' ? 'unloadLib' : 'unload', r.name)"
      >
        卸载
      </button>
    </span>
  </div>

  <h3>共享依赖</h3>
  <div v-if="!shareRows.length" class="muted">（无）</div>
  <div v-for="row in shareRows" :key="row.key" class="row">
    <span class="k">{{ row.name }}{{ row.scope !== 'global' ? ` @${row.scope}` : '' }}</span>
    <span class="pill" :class="{ loaded: row.v.loaded }">{{ row.v.version }}{{ row.v.loaded ? ' ✓' : '' }}</span>
  </div>

  <template v-if="conflicts.length">
    <h3>共享冲突 ({{ conflicts.length }})</h3>
    <div v-for="c in conflicts" :key="`${c.name}:${c.requiredVersion}`" class="row">
      <span class="k">{{ c.name }}</span>
      <span class="pill error">需要 {{ c.requiredVersion }} / 提供 {{ (c.provided || []).join(', ') || '无' }}</span>
    </div>
  </template>

  <h3>插件 ({{ plugins.enabled }}/{{ plugins.total }})</h3>
  <div v-if="!plugins.list.length" class="muted">（无）</div>
  <div v-for="p in plugins.list" :key="p.name" class="row">
    <span class="k" :title="p.description">{{ p.name }}</span>
    <span class="pill" :class="{ loaded: p.enabled }">{{ p.enabled ? '已启用' : '可用' }}</span>
  </div>

  <h3>加载指标</h3>
  <div v-if="!metrics.length" class="muted">（启用 logger 插件后可见）</div>
  <div v-for="(m, i) in metrics" :key="`${m.entry}:${m.time}:${i}`" class="row">
    <span class="k" :title="`${m.entry}${m.host ? ' @' + m.host : ''}`"
      >加载{{ kindLabel(m.kind) }}「{{ prettyEntry(m.entry, map) }}」</span
    >
    <span class="pill" :class="m.status === 'error' ? 'error' : 'loaded'">{{ ms(m.durationMs) }}</span>
  </div>

  <h3>性能</h3>
  <div v-if="!perf.length" class="muted">（无）</div>
  <div v-for="(p, i) in perf" :key="`${p.name}:${i}`" class="row">
    <span class="k" :title="p.name">{{ perfLabel(p.name, map) }}</span>
    <span class="v">{{ ms(p.durationMs) }}</span>
  </div>

  <h3>事件</h3>
  <div v-if="!events.length" class="muted">（无）</div>
  <div v-for="(e, i) in events" :key="`${e.time}:${i}`" class="row">
    <span class="k" :title="e.type">{{ e.summary }}</span>
    <span class="pill">{{ timeStr(e.time) }}</span>
  </div>

  <h3>诊断</h3>
  <div v-if="!diagnostics.length" class="muted">（无）</div>
  <div v-for="(d, i) in diagnostics" :key="`${d.time}:${i}`" class="diag" :class="{ error: d.level === 'error' }">
    <span class="code">{{ d.code }}</span>
    <span> {{ d.message }}</span>
    <span class="pill">{{ timeStr(d.time) }}</span>
  </div>
</template>
