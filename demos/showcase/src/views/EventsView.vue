<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { getInstance, getRemote, loadApp, loadLib } from 'linkjs';
import CodeBlock from '../components/CodeBlock.vue';

interface BusEvent {
  t: number;
  type: string;
  summary: string;
  via?: string;
}
const events = ref<BusEvent[]>([]);
let seq = 0;

const bus = getInstance().eventBus;
function push(type: string, summary: string, via?: string): void {
  seq++;
  events.value = [{ t: Date.now(), type, summary, via }, ...events.value].slice(0, 60);
}

function keysOf(value: unknown): string {
  return value && typeof value === 'object' ? Object.keys(value as object).join(', ') : '';
}

const handlers: Array<{ type: string; cb: (payload: any) => void }> = [
  {
    type: 'libExpose',
    cb: (p) => push('libExpose', (p?.libName ?? '') + ': { ' + keysOf(p?.lib) + ' }'),
  },
  {
    type: 'SharedExpose',
    cb: (p) => push('SharedExpose', (p?.libName ?? '') + ': { ' + keysOf(p?.shared) + ' }'),
  },
  { type: 'remoteUpdate', cb: (p) => push('remoteUpdate', String(p?.appName ?? '') + (p?.key ? '/' + p.key : '')) },
];

const subscribed = ref(true);
function subscribe(): void {
  for (const h of handlers) bus.on(h.type as never, h.cb as never);
  subscribed.value = true;
}
function clearListeners(): void {
  // 注意：clear 会清空**所有**监听（含 devtools 内部监听）。
  bus.clear();
  subscribed.value = false;
  push('bus', 'clear() 已清空所有监听');
}
function offOne(): void {
  bus.off('libExpose' as never, handlers[0].cb as never);
  subscribed.value = false;
  push('bus', "off('libExpose') 已取消本页 libExpose 监听");
}

onMounted(() => subscribe());
onUnmounted(() => {
  for (const h of handlers) bus.off(h.type as never, h.cb as never);
});

const busy = ref('');
async function run(fn: () => Promise<void>): Promise<void> {
  busy.value = 'x';
  try {
    await fn();
  } catch (error) {
    // 避免异步加载失败变成未处理的 rejection（Vue 事件处理器会告警）。
    push('error', String((error as Error)?.message || error));
  } finally {
    busy.value = '';
  }
}

// libExpose + SharedExpose：首次加载远端库（其入口 expose + shared 各触发一次）；
// 已加载时再次点击命中模块缓存、不会重新执行入口 → 手动 re-expose 以再次触发 libExpose。
const triggerLib = () =>
  run(async () => {
    const before = getRemote('remote-lib');
    const mod = (await loadLib('remote-lib')) as Record<string, unknown> | null;
    if (before && mod) {
      getInstance().expose('remote-lib', mod, { version: '1.0.0' });
    }
  });

// REMOTE_UPDATE：先加载，再对已缓存模块 re-expose → 广播 remoteUpdate
const triggerUpdate = () =>
  run(async () => {
    await loadApp('shareRemote', { shadow: true });
    const mod = (getRemote('shareRemote') as Record<string, unknown>) || {};
    getInstance().expose('shareRemote', mod, { version: '1.0.0' });
  });

// once：订阅一次性监听，再触发
const onceCount = ref(0);
function subscribeOnce(): void {
  bus.once(
    'libExpose' as never,
    (() => {
      onceCount.value++;
      push('once', 'once(libExpose) 触发一次后自动移除', 'once');
    }) as never,
  );
  push('bus', '已注册 once(libExpose)');
}

function timeStr(t: number): string {
  return new Date(t).toLocaleTimeString();
}

const typeClass = computed(
  () => (type: string) =>
    type === 'remoteUpdate' ? 'warn' : type === 'SharedExpose' ? 'accent' : type === 'bus' || type === 'once' ? 'faint' : 'indigo',
);

const code = `import { getInstance } from 'linkjs';
const bus = getInstance().eventBus;

bus.on('libExpose', (p) => log('libExpose', p.libName));      // 远程 expose
bus.on('SharedExpose', (p) => log('SharedExpose', p.libName)); // 远程 shared
bus.on('remoteUpdate', (p) => log('remoteUpdate', p.appName)); // 再次 expose

const off = () => bus.off('libExpose', cb);
bus.once('libExpose', cb);   // 只触发一次
bus.clear();                 // 清空所有监听`;
</script>

<template>
  <div class="page rise rise-1">
    <header class="head">
      <h1>事件总线时间线</h1>
      <p class="sub">
        订阅 linkjs 实例事件总线：<code>libExpose</code> / <code>SharedExpose</code> / <code>remoteUpdate</code>， 并演示
        <code>once</code>（一次性）与 <code>clear</code>（清空全部监听）。
      </p>
    </header>

    <div class="grid">
      <div class="col">
        <section class="panel block">
          <h3 class="sec">触发</h3>
          <div class="controls">
            <button class="btn btn-primary" :disabled="!!busy" @click="triggerLib">
              加载 remote-lib（首次 libExpose + SharedExpose；重复点击 re-expose）
            </button>
            <button class="btn" :disabled="!!busy" @click="triggerUpdate">re-expose shareRemote（remoteUpdate）</button>
          </div>
          <div class="controls">
            <button class="btn" :disabled="!!busy" @click="subscribeOnce">订阅 once(libExpose)</button>
            <button class="btn" :disabled="!!busy" @click="offOne">off(libExpose)</button>
            <button class="btn" :disabled="!!busy" @click="clearListeners">clear()</button>
            <button class="btn" :disabled="subscribed" @click="subscribe">重新订阅</button>
          </div>
          <p class="hint mono faint">本页监听：{{ subscribed ? '已订阅' : '部分/全部取消' }} · once 已触发 {{ onceCount }} 次</p>
        </section>

        <CodeBlock title="订阅 / 取消" :code="code" />
      </div>

      <div class="col">
        <section class="panel block">
          <h3 class="sec">事件流（{{ events.length }}）</h3>
          <ul class="feed" v-if="events.length">
            <li v-for="(e, i) in events" :key="i">
              <span class="t mono faint">{{ timeStr(e.t) }}</span>
              <span class="tag mono" :class="typeClass(e.type)">{{ e.type }}</span>
              <span class="msg mono">{{ e.summary }}</span>
            </li>
          </ul>
          <p v-else class="faint empty">点击触发后出现。</p>
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
  grid-template-columns: 0.95fr 1.05fr;
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
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
}
.hint {
  font-size: 12px;
  margin: 4px 0 0;
}
.feed {
  list-style: none;
  margin: 0;
  padding: 0;
  border-top: 1px solid var(--line);
}
.feed li {
  display: grid;
  grid-template-columns: 74px 110px 1fr;
  gap: 12px;
  padding: 9px 4px;
  border-bottom: 1px solid var(--line);
  font-size: 12px;
  align-items: baseline;
}
.tag {
  color: var(--indigo);
}
.tag.warn {
  color: var(--amber);
}
.tag.accent {
  color: var(--accent);
}
.tag.faint {
  color: var(--faint);
}
.msg {
  color: var(--muted);
  word-break: break-all;
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
