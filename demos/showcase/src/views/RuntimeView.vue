<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
import CodeBlock from '../components/CodeBlock.vue';
import StatusPill from '../components/StatusPill.vue';
import { useSnapshot } from '../composables/useSnapshot';
import { getRemote, loadApp, loadLib, unloadLib, unloadRemote } from 'linkjs';

const { snapshot, refresh } = useSnapshot(500);
const busy = ref(false);
const error = ref('');
// 卸载后：远端模块已被浏览器缓存，重复 import 不会再次 expose，需刷新页面才能重新加载。
const dead = ref(false);
// 远程组件是 Vue 组件对象，用 shallowRef 避免被响应式代理（否则触发 Vue 警告）。
const libComponent = shallowRef<unknown>(null);
const log = ref<Array<{ t: string; msg: string }>>([]);

const remotes = computed(() => snapshot.value.remotes || []);
const remoteApp = computed(() => remotes.value.find((r) => r.name === 'remoteApp'));
const remoteLib = computed(() => remotes.value.find((r) => r.name === 'remote-lib'));
const events = computed(() => (snapshot.value.events || []).slice(0, 8));

const pipeline = computed(() => [
  { k: 'HOST', s: 'loaded', note: '宿主运行时' },
  { k: 'remote-lib', s: remoteLib.value?.status || 'unloaded', note: '被依赖方（Lib）' },
  { k: 'remoteApp', s: remoteApp.value?.status || 'unloaded', note: '依赖方（App）' },
]);

function stamp(msg: string) {
  const d = new Date();
  const t = `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  log.value.unshift({ t, msg });
}

async function run(label: string, fn: () => Promise<unknown>) {
  busy.value = true;
  error.value = '';
  stamp(label);
  try {
    await fn();
    refresh();
  } catch (e) {
    error.value = (e as Error)?.message || String(e);
    stamp(`失败：${error.value}`);
  } finally {
    busy.value = false;
  }
}

const loadRemoteApp = () => {
  if (dead.value) return;
  log.value = [];
  return run('loadApp("remoteApp") → 拓扑先加载 remote-lib', async () => {
    libComponent.value = null;
    await loadApp('remoteApp');
    libComponent.value = getRemote('remoteApp/RemoteLibSlot');
    stamp('getRemote("remoteApp/RemoteLibSlot") 取用依赖方组件');
  });
};

const loadLibOnly = () => {
  if (dead.value) return;
  return run('loadLib("remote-lib")', async () => {
    await loadLib('remote-lib');
    stamp('remote-lib 已单独加载');
  });
};

function reset() {
  libComponent.value = null;
  log.value = [];
  unloadRemote('remoteApp');
  unloadLib('remote-lib');
  stamp('卸载 remoteApp + remote-lib，引用计数归零');
  dead.value = true;
  refresh();
}

const reload = () => location.reload();

function timeStr(t: number) {
  const d = new Date(t);
  return `${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

const code = `import { loadApp, getRemote, unloadRemote } from 'linkjs';

await loadApp('remoteApp');                       // 拓扑：先 remote-lib，后 remoteApp
const Slot = getRemote('remoteApp/RemoteLibSlot'); // 消费依赖方组件`;
</script>

<template>
  <div class="page rise rise-1">
    <header class="head">
      <h1>运行时加载</h1>
      <p class="sub">
        宿主仅调用 <code>loadApp('remoteApp')</code>。remoteApp 在注册表声明了依赖
        <code>remote-lib</code>，因此 linkjs 会先加载 remote-lib，再加载 remoteApp，最后用
        <code>getRemote</code> 取用其暴露的组件。
      </p>
    </header>

    <div class="grid">
      <div class="col">
        <CodeBlock title="RuntimeView.vue" :code="code" />

        <div class="controls">
          <button class="btn btn-primary" :disabled="busy || dead" @click="loadRemoteApp">加载 remoteApp</button>
          <button class="btn" :disabled="busy || dead" @click="loadLibOnly">仅加载 remote-lib</button>
          <button class="btn btn-ghost" :disabled="busy" @click="reset">全部卸载</button>
          <button v-if="dead" class="btn" @click="reload">刷新页面</button>
        </div>

        <p v-if="dead" class="notice">已卸载：远端模块已被浏览器缓存，重复加载不会再次 expose —— 点「刷新页面」回到初始态。</p>
        <p v-if="error" class="error mono">{{ error }}</p>

        <h3 class="sec">解析日志</h3>
        <ul class="log" v-if="log.length">
          <li v-for="(l, i) in log" :key="i">
            <span class="t mono">{{ l.t }}</span>
            <span class="m">{{ l.msg }}</span>
          </li>
        </ul>
        <p v-else class="faint empty">点击按钮后显示。</p>
      </div>

      <div class="col">
        <div class="panel pipeline">
          <span class="label mono faint">拓扑顺序</span>
          <div class="steps">
            <template v-for="(p, i) in pipeline" :key="p.k">
              <div class="step" :class="{ done: p.s === 'loaded', active: p.s === 'loading' }">
                <span class="step-dot" />
                <span class="step-k mono">{{ p.k }}</span>
                <span class="step-note faint">{{ p.note }}</span>
              </div>
              <span v-if="i < pipeline.length - 1" class="arrow" :class="{ flow: p.s === 'loaded' }">↓</span>
            </template>
          </div>
        </div>

        <div class="panel status-card">
          <div class="row">
            <span class="k mono">remoteApp</span>
            <StatusPill :status="remoteApp?.status" />
          </div>
          <div class="deps" v-if="remoteApp?.deps?.length">
            <span class="faint">依赖</span>
            <span v-for="d in remoteApp.deps" :key="d.name" class="dep-chip mono">{{ d.name }} · {{ d.status || '?' }}</span>
          </div>
          <div class="row">
            <span class="k mono">remote-lib</span>
            <StatusPill :status="remoteLib?.status" />
          </div>
        </div>

        <div class="panel stage">
          <span class="stage-label mono faint">remoteApp / RemoteLibSlot</span>
          <component :is="libComponent" v-if="libComponent" />
          <p v-else class="faint placeholder">加载 remoteApp 后，此处渲染 remoteApp 消费的 remote-lib 组件。</p>
        </div>
      </div>
    </div>

    <section class="events-block">
      <h3 class="sec">linkjs 事件</h3>
      <ul class="events" v-if="events.length">
        <li v-for="(e, i) in events" :key="i">
          <span class="t mono faint">{{ timeStr(e.time) }}</span>
          <span class="ev mono">{{ e.type }}</span>
          <span class="sum mono">{{ e.summary }}</span>
        </li>
      </ul>
      <p v-else class="faint empty">加载后可见 libExpose / sharedExpose / remoteUpdate 事件。</p>
    </section>
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
.head code {
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
  flex-wrap: wrap;
}
.sec {
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--faint);
  font-family: var(--mono);
  font-weight: 600;
  margin: 4px 0 0;
}
.error {
  color: var(--danger);
  font-size: 12.5px;
  padding: 10px 12px;
  border: 1px solid color-mix(in oklab, var(--danger) 30%, transparent);
  border-radius: var(--radius-sm);
  background: color-mix(in oklab, var(--danger) 8%, transparent);
}
.notice {
  color: var(--amber);
  font-size: 12.5px;
  line-height: 1.6;
}
.log {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--line);
}
.log li {
  display: flex;
  gap: 14px;
  padding: 9px 2px;
  border-bottom: 1px solid var(--line);
  font-size: 13px;
}
.log .t {
  color: var(--faint);
  font-size: 11.5px;
  padding-top: 2px;
}

.pipeline {
  padding: 16px;
}
.pipeline .label {
  display: block;
  font-size: 11px;
  margin-bottom: 12px;
}
.steps {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.step {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  color: var(--muted);
  transition: all 0.3s var(--ease);
}
.step.done {
  color: var(--accent);
  border-color: color-mix(in oklab, var(--accent) 40%, transparent);
  background: color-mix(in oklab, var(--accent) 8%, transparent);
}
.step.active {
  color: var(--amber);
  border-color: color-mix(in oklab, var(--amber) 40%, transparent);
}
.step-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
.step-k {
  font-size: 12px;
}
.step-note {
  font-size: 10.5px;
}
.arrow {
  color: var(--line-strong);
  font-size: 14px;
}
.arrow.flow {
  color: var(--accent);
}

.status-card {
  padding: 6px 16px;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 0;
  border-bottom: 1px solid var(--line);
}
.row:last-child {
  border-bottom: none;
}
.k {
  font-size: 13px;
}
.deps {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding-bottom: 12px;
  font-size: 12px;
}
.dep-chip {
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  padding: 2px 9px;
  color: var(--muted);
  font-size: 11.5px;
}
.stage {
  padding: 16px;
  min-height: 110px;
}
.stage-label {
  display: block;
  font-size: 11px;
  margin-bottom: 12px;
}
.placeholder {
  font-size: 13px;
  line-height: 1.6;
}

.events-block {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.events {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--line);
}
.events li {
  display: grid;
  grid-template-columns: 60px 130px 1fr;
  gap: 14px;
  padding: 9px 4px;
  border-bottom: 1px solid var(--line);
  font-size: 12.5px;
  align-items: baseline;
}
.ev {
  color: var(--indigo);
}
.sum {
  color: var(--muted);
}
.empty {
  font-size: 13px;
}

@media (max-width: 860px) {
  .grid {
    grid-template-columns: 1fr;
  }
  .events li {
    grid-template-columns: 60px 1fr;
  }
}
</style>
