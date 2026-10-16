<script setup lang="ts">
import { computed, defineComponent, h, onMounted, onUnmounted, ref, watch } from 'vue';
import { getInstance, loadApp, unloadRemote } from 'linkjs';
import { createRemoteApp, createRemoteComponent } from 'linkjs/vue';
import StatusPill from '../components/StatusPill.vue';
import { useSnapshot } from '../composables/useSnapshot';
import CodeBlock from '../components/CodeBlock.vue';

const { snapshot, refresh } = useSnapshot(600);

interface Transition {
  t: number;
  name: string;
  to: string;
}
const timeline = ref<Transition[]>([]);
const lastStatus = new Map<string, string>();

const tracked = ['shareRemote', 'remoteApp', 'brokenApp'];

const remotes = computed(() =>
  tracked.map((name) => ({
    name,
    status: (snapshot.value.remotes || []).find((r) => r.name === name)?.status || 'unloaded',
    type: (snapshot.value.remotes || []).find((r) => r.name === name)?.type || '-',
  })),
);

function record(name: string, to: string): void {
  timeline.value = [{ t: Date.now(), name, to }, ...timeline.value].slice(0, 40);
}

watch(snapshot, (snap) => {
  for (const name of tracked) {
    const status = (snap.remotes || []).find((r) => r.name === name)?.status || 'unloaded';
    const prev = lastStatus.get(name);
    if (prev !== status) {
      lastStatus.set(name, status);
      if (prev !== undefined || status !== 'unloaded') {
        record(name, status);
      }
    }
  }
});

const showProbe = ref(false);
const probeBusy = ref(false);
const Probe = createRemoteComponent('shareRemote/NegotiationProbe');

async function loadProbe(): Promise<void> {
  probeBusy.value = true;
  try {
    await loadApp('shareRemote', { shadow: true });
    showProbe.value = true;
  } finally {
    probeBusy.value = false;
    refresh();
  }
}
function unloadProbe(): void {
  unloadRemote('shareRemote');
  showProbe.value = false;
  refresh();
}
async function reloadProbe(): Promise<void> {
  unloadProbe();
  await new Promise((r) => setTimeout(r, 120));
  await loadProbe();
}

// 路线 B：createRemoteApp 的 loading / error 槽
const LoadingSlot = defineComponent({
  setup: () => () => h('div', { class: 'slot' }, 'loading…（骨架占位）'),
});
const ErrorSlot = defineComponent({
  props: { error: {} },
  setup: (props) => () =>
    h('div', { class: 'slot err' }, `error 槽：${(props.error as Error)?.message ?? String(props.error)}`),
});
const GoodApp = createRemoteApp('remoteApp', { loading: LoadingSlot, error: ErrorSlot });
const BrokenApp = createRemoteApp('brokenApp', {
  host: 'http://localhost:9',
  entry: 'index.html',
  loading: LoadingSlot,
  error: ErrorSlot,
});

const showRouteB = ref(false);
const showBroken = ref(false);

function timeStr(t: number): string {
  return new Date(t).toLocaleTimeString();
}

const code = `import { loadApp, unloadRemote, getSnapshot } from 'linkjs';
import { createRemoteApp } from 'linkjs/vue';

// 状态机：unloaded → loading → loaded（失败回退 unloaded）
getSnapshot().remotes.find(r => r.name === 'shareRemote')?.status;

// 手动卸载 / 重载
unloadRemote('shareRemote');
await loadApp('shareRemote', { shadow: true });

// 路线 B：容器自带 loading / error 槽
const App = createRemoteApp('remoteApp', {
  loading: LoadingSkeleton,
  error: ErrorPanel,
});`;
</script>

<template>
  <div class="page rise rise-1">
    <header class="head">
      <h1>加载生命周期 / 状态机</h1>
      <p class="sub">
        远程状态流转 <code>unloaded → loading → loaded</code>（失败回退 <code>unloaded</code>），
        以及 <code>unloadRemote</code> 卸载后重载；路线 B 的 <code>createRemoteApp</code> 支持
        <code>loading</code>/<code>error</code> 槽，加载失败时优雅降级。
      </p>
    </header>

    <div class="grid">
      <div class="col">
        <section class="panel block">
          <h3 class="sec">远程状态</h3>
          <ul class="remotes">
            <li v-for="r in remotes" :key="r.name">
              <span class="mono name">{{ r.name }}</span>
              <span class="mono faint">{{ r.type }}</span>
              <StatusPill :status="r.status" />
            </li>
          </ul>
        </section>

        <section class="panel block">
          <h3 class="sec">状态流转时间线</h3>
          <ul class="feed" v-if="timeline.length">
            <li v-for="(e, i) in timeline" :key="i">
              <span class="t mono faint">{{ timeStr(e.t) }}</span>
              <span class="mono name">{{ e.name }}</span>
              <StatusPill :status="e.to" />
            </li>
          </ul>
          <p v-else class="faint empty">操作后出现。</p>
        </section>

        <section class="panel block">
          <h3 class="sec">路线 A：加载 / 卸载 / 重载</h3>
          <div class="controls">
            <button class="btn btn-primary" :disabled="probeBusy" @click="loadProbe">加载 shareRemote</button>
            <button class="btn" :disabled="probeBusy" @click="unloadProbe">卸载</button>
            <button class="btn" :disabled="probeBusy" @click="reloadProbe">重载</button>
          </div>
          <component :is="Probe" v-if="showProbe" />
          <p v-else class="faint">加载后此处出现远端组件；卸载后消失。</p>
        </section>
      </div>

      <div class="col">
        <CodeBlock title="状态机与容器" :code="code" />

        <section class="panel block">
          <h3 class="sec">路线 B：createRemoteApp（loading / error 槽）</h3>
          <div class="controls">
            <button class="btn" :disabled="showRouteB" @click="showRouteB = true">挂载 remoteApp（含 loading 槽）</button>
            <button class="btn" :disabled="showBroken" @click="showBroken = true">挂载 brokenApp（含 error 槽）</button>
          </div>
          <div class="route-b">
            <div class="frame">
              <span class="frame-label mono faint">remoteApp</span>
              <component :is="GoodApp" v-if="showRouteB" />
              <p v-else class="faint">未挂载</p>
            </div>
            <div class="frame">
              <span class="frame-label mono faint">brokenApp（host 不可达）</span>
              <component :is="BrokenApp" v-if="showBroken" />
              <p v-else class="faint">未挂载</p>
            </div>
          </div>
        </section>

        <section class="panel block">
          <h3 class="sec">实例</h3>
          <p class="faint mono">
            remotes={{ (snapshot.remotes || []).length }} ·
            plugins={{ (snapshot.plugins || []).length }} ·
            events={{ (snapshot.events || []).length }}
          </p>
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
  grid-template-columns: 1fr 1fr;
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
.remotes,
.feed {
  list-style: none;
  margin: 0;
  padding: 0;
}
.remotes li,
.feed li {
  display: grid;
  grid-template-columns: 1fr 60px auto;
  gap: 12px;
  align-items: center;
  padding: 9px 0;
  border-bottom: 1px solid var(--line);
  font-size: 12.5px;
}
.feed li {
  grid-template-columns: 80px 1fr auto;
}
.remotes li:last-child,
.feed li:last-child {
  border-bottom: none;
}
.name {
  color: var(--text);
}
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}
.route-b {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.frame {
  border: 1px dashed var(--line-strong);
  border-radius: 10px;
  padding: 12px;
  min-height: 90px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.frame-label {
  font-size: 11px;
}
:deep(.slot) {
  font-size: 12.5px;
  color: var(--muted);
  padding: 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.04);
}
:deep(.slot.err) {
  color: var(--danger);
  border: 1px solid color-mix(in oklab, var(--danger) 40%, transparent);
}
.empty {
  font-size: 13px;
}
@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr;
  }
}
</style>
