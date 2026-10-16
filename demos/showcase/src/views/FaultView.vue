<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  authPlugin,
  fallbackPlugin,
  getLoadMetrics,
  loadApp,
  loadLib,
  loggerPlugin,
  registerPlugin,
  retryPlugin,
  timeoutPlugin,
  unloadLib,
  unloadRemote,
} from 'linkjs';
import CodeBlock from '../components/CodeBlock.vue';

interface FaultLog {
  t: number;
  kind: string;
  detail: string;
}
const faultLog = ref<FaultLog[]>([]);
function rec(kind: string, detail: string): void {
  faultLog.value = [{ t: Date.now(), kind, detail }, ...faultLog.value].slice(0, 100);
}

const result = ref('');

// DEAD：连接被拒绝（快速失败）。
const DEAD = 'http://localhost:9';

onMounted(() => {
  registerPlugin([
    timeoutPlugin({
      timeout: 8000,
      timeouts: { faultSlow: 900 },
      onTimeout: (i) => rec('timeout', `${i.entry} @ ${i.timeout}ms`),
    }),
    retryPlugin({
      fallbackHosts: { shareRemote: ['http://localhost:8091'], faultRetry: ['http://localhost:8091'] },
      onRetry: (i) => rec('retry', `${i.entry} attempt#${i.attempt} → ${i.nextHost}`),
      onError: (e, entry) => rec('retry', `${entry} 全部候选失败: ${String(e)}`),
    }),
    fallbackPlugin({
      defaultFallback: false,
      fallback: {
        faultDead: () => ({ __linkjsFallback: true, note: 'dead remote 的兜底模块（占位）' }),
      },
      onError: (e, entry) => rec('fallback', `${entry} 失败并降级: ${String(e)}`),
    }),
    authPlugin({ tokens: { 'remote-lib': 'demo-secret' }, queryParam: 'token' }),
    loggerPlugin({ log: (e) => rec('logger', JSON.stringify(e)) }),
  ]);
  rec('init', '已注册 5 个内置插件（timeout/retry/fallback/auth/logger）');
});

const busy = ref('');
const tick = ref(0);
async function run(name: string, fn: () => Promise<string>): Promise<void> {
  busy.value = name;
  try {
    result.value = await fn();
  } catch (error) {
    result.value = `✗ ${String((error as Error).message || error)}`;
  } finally {
    busy.value = '';
    tick.value++;
  }
}

const runTimeout = () =>
  run('timeout', async () => {
    // 指向本机一个「有 HTML 但永不 expose」的页面 → 加载挂起；
    // timeoutPlugin 在 900ms 后以 TimeoutError 中止（并 abort 入口 fetch）。
    await loadApp('faultSlow', { host: location.origin, entry: 'slow-probe.html' });
    return '（意外成功）';
  });

const runRetry = () =>
  run('retry', async () => {
    // 主 host 不可达，retryPlugin 按 fallbackHosts 重试到 :8091 → 成功。
    unloadRemote('shareRemote');
    const mod = await loadApp('shareRemote', { host: DEAD, entry: 'index.html' });
    return mod ? '✓ 重试成功：已从候补 host (http://localhost:8091) 加载' : '（无结果）';
  });

const runFallback = () =>
  run('fallback', async () => {
    const mod = (await loadApp('faultDead', { host: DEAD, entry: 'index.html' })) as
      | { __linkjsFallback?: boolean }
      | null;
    return mod?.__linkjsFallback ? '✓ 已降级为兜底模块（__linkjsFallback）' : '（非兜底返回）';
  });

const authUrls = ref<string[]>([]);
const runAuth = () =>
  run('auth', async () => {
    unloadLib('remote-lib');
    await loadLib('remote-lib');
    const urls = performance
      .getEntriesByType('resource')
      .map((e) => e.name)
      .filter((n) => n.includes('token=demo-secret'));
    authUrls.value = [...new Set(urls)].slice(0, 6);
    return authUrls.value.length ? `✓ 已注入 token，命中 ${authUrls.value.length} 个资源` : '（未观察到 token，可重试）';
  });

const metrics = computed(() => {
  void tick.value;
  return getLoadMetrics().slice(-8).reverse();
});

function timeStr(t: number): string {
  return new Date(t).toLocaleTimeString();
}

const code = `import { createInstance, timeoutPlugin, retryPlugin, fallbackPlugin, authPlugin, loggerPlugin } from 'linkjs';

createInstance({
  plugin: [
    timeoutPlugin({ timeouts: { faultSlow: 900 } }),
    retryPlugin({ fallbackHosts: { faultRetry: ['http://localhost:8091'] } }),
    fallbackPlugin({ fallback: { faultDead: () => placeholder } }),
    authPlugin({ tokens: { 'remote-lib': 'demo-secret' }, queryParam: 'token' }),
    loggerPlugin(),
  ],
});`;
</script>

<template>
  <div class="page rise rise-1">
    <header class="head">
      <h1>故障注入 / 官方插件</h1>
      <p class="sub">
        点击下方按钮，用**不可达地址**触发真实故障，观察 5 个内置插件如何介入：
        <code>timeout</code> 中止、<code>retry</code> 候补 host 重试、<code>fallback</code> 优雅降级、
        <code>auth</code> 统一注入 token、<code>logger</code> 采集加载指标。
      </p>
    </header>

    <div class="grid">
      <div class="col">
        <section class="panel block">
          <h3 class="sec">场景</h3>
          <div class="scenarios">
            <div class="scn">
              <div class="scn-head"><b>timeout</b><span class="faint">不暴露模块 → 900ms 中止</span></div>
              <button class="btn btn-primary" :disabled="!!busy" @click="runTimeout">触发超时</button>
            </div>
            <div class="scn">
              <div class="scn-head"><b>retry</b><span class="faint">{{ DEAD }} → :8091</span></div>
              <button class="btn btn-primary" :disabled="!!busy" @click="runRetry">触发重试</button>
            </div>
            <div class="scn">
              <div class="scn-head"><b>fallback</b><span class="faint">不可达 → 兜底模块</span></div>
              <button class="btn btn-primary" :disabled="!!busy" @click="runFallback">触发降级</button>
            </div>
            <div class="scn">
              <div class="scn-head"><b>auth</b><span class="faint">remote-lib 追加 ?token=</span></div>
              <button class="btn btn-primary" :disabled="!!busy" @click="runAuth">触发鉴权注入</button>
            </div>
          </div>
          <p class="result mono">{{ result || '（尚未操作）' }}</p>
          <ul v-if="authUrls.length" class="urls">
            <li v-for="u in authUrls" :key="u" class="mono">{{ u }}</li>
          </ul>
        </section>

        <CodeBlock title="注册插件" :code="code" />
      </div>

      <div class="col">
        <section class="panel block">
          <h3 class="sec">logger 指标（getLoadMetrics）</h3>
          <ul class="feed" v-if="metrics.length">
            <li v-for="(m, i) in metrics" :key="i">
              <span class="t mono faint">{{ timeStr(m.time) }}</span>
              <span class="tag mono" :class="m.status">{{ m.status }}</span>
              <span class="msg mono">{{ m.entry }}</span>
              <span class="dur mono">{{ m.durationMs }}ms</span>
            </li>
          </ul>
          <p v-else class="faint empty">触发任意场景后可见。</p>
        </section>

        <section class="panel block">
          <h3 class="sec">插件事件</h3>
          <ul class="feed" v-if="faultLog.length">
            <li v-for="(l, i) in faultLog.slice(0, 16)" :key="i">
              <span class="t mono faint">{{ timeStr(l.t) }}</span>
              <span class="tag mono">{{ l.kind }}</span>
              <span class="msg">{{ l.detail }}</span>
            </li>
          </ul>
          <p v-else class="faint empty">暂无。</p>
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
.scenarios {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin-bottom: 12px;
}
.scn {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.scn-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12.5px;
}
.scn-head span {
  font-size: 11px;
}
.result {
  margin: 0;
  font-size: 12.5px;
  color: var(--text);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 10px 12px;
  word-break: break-all;
}
.urls {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.urls li {
  font-size: 11px;
  color: var(--indigo);
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
  grid-template-columns: 74px 62px 1fr auto;
  gap: 12px;
  padding: 9px 4px;
  border-bottom: 1px solid var(--line);
  font-size: 12px;
  align-items: baseline;
}
.tag.loaded {
  color: var(--accent);
}
.tag.error {
  color: var(--danger);
}
.msg {
  color: var(--muted);
  word-break: break-all;
}
.dur {
  color: var(--text);
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
