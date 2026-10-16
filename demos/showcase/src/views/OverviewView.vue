<script setup lang="ts">
import { computed } from 'vue';
import DepGraph from '../components/DepGraph.vue';
import { useSnapshot } from '../composables/useSnapshot';

const { snapshot } = useSnapshot();
const remotes = computed(() => snapshot.value.remotes || []);
const shares = computed(() => snapshot.value.shares || []);

const loaded = computed(() => remotes.value.filter((r) => r.status === 'loaded').length);
const deps = computed(() => remotes.value.reduce((n, r) => n + (r.deps?.length || 0), 0));

const concepts = [
  { k: '拓扑加载', v: '远程声明依赖 → 先加载被依赖方，再加载自身。' },
  { k: '并发去重', v: '同名依赖并发只加载一次（inflight 合并）。' },
  { k: '引用计数', v: '多个依赖者共享同一实例；全部释放后才卸载。' },
  { k: '共享实例', v: 'vue / pinia / vue-router 等单例在全页复用一份。' },
];

const entries = [
  { to: '/runtime', k: '运行时加载', v: 'loadApp + getRemote 异步消费，拓扑加载日志与实时状态。' },
  { to: '/static', k: '构建期 import', v: "import { X } from '<remote>' 虚拟模块 + preload 预加载。" },
  { to: '/topology', k: '依赖拓扑', v: '实时 SVG 依赖图、提供方与依赖表。' },
  { to: '/preload', k: '路由级预取', v: 'preloadRemote 预热并对比首屏耗时。' },
  { to: '/sources', k: '多源灰度', v: '多候选源健康检查、first-healthy 与 weighted 灰度。' },
  { to: '/shadow', k: 'Shadow 隔离', v: '影子树样式隔离与设计令牌穿透。' },
  { to: '/plugins', k: '插件机制', v: 'RuntimePlugin 全钩子 + 运行时注册 + 内置目录。' },
  { to: '/types', k: '类型转发', v: 'consumeTypes 生成 declare module 与虚拟模块源码。' },
  { to: '/hmr', k: 'HMR 热更新', v: 'subscribeRemoteUpdate 订阅远端更新。' },
  { to: '/observability', k: '可观测', v: '快照：依赖/共享/事件/指标/性能/诊断。' },
];
</script>

<template>
  <div class="overview">
    <section class="lede rise rise-1">
      <h1>远程依赖，自动拓扑加载</h1>
      <p class="lede-sub">
        宿主只加载一个远程，linkjs 会解析它声明的远程依赖，先加载被依赖方，再加载自身——
        就像本地模块一样自然。共享依赖全页一份，去重、引用计数、故障回退都由运行时兜底。
      </p>
      <div class="metrics">
        <div class="metric">
          <span class="m-val tnum"
            >{{ loaded }}<em>/{{ remotes.length }}</em></span
          >
          <span class="m-k">已加载远程</span>
        </div>
        <div class="metric">
          <span class="m-val tnum">{{ deps }}</span>
          <span class="m-k">远程依赖边</span>
        </div>
        <div class="metric">
          <span class="m-val tnum">{{ shares.length }}</span>
          <span class="m-k">共享依赖</span>
        </div>
        <div class="metric">
          <span class="m-val mono">{{ snapshot.instance?.mode || '—' }}</span>
          <span class="m-k">运行模式</span>
        </div>
      </div>
    </section>

    <section class="rise rise-2">
      <DepGraph :instance-name="snapshot.instance?.name" :remotes="remotes" :shares="shares" />
    </section>

    <section class="rise rise-3">
      <h2 class="sec-title">核心概念</h2>
      <div class="concepts">
        <div v-for="c in concepts" :key="c.k" class="concept">
          <span class="c-k">{{ c.k }}</span>
          <span class="c-v">{{ c.v }}</span>
        </div>
      </div>
    </section>

    <section class="rise rise-4">
      <h2 class="sec-title">逐个示例</h2>
      <div class="entries">
        <RouterLink v-for="e in entries" :key="e.to" :to="e.to" class="entry">
          <span class="e-k">{{ e.k }}</span>
          <span class="e-v">{{ e.v }}</span>
          <span class="e-go">→</span>
        </RouterLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.overview {
  display: flex;
  flex-direction: column;
  gap: 40px;
}
.lede {
  max-width: 760px;
  padding-top: 8px;
}
.lede-sub {
  margin-top: 16px;
  color: var(--muted);
  font-size: clamp(1rem, 1.4vw, 1.15rem);
  line-height: 1.75;
  max-width: 66ch;
}
.metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  margin-top: 28px;
  border-top: 1px solid var(--line);
}
.metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px 4px;
  border-bottom: 1px solid var(--line);
}
.metric + .metric {
  padding-left: 20px;
  border-left: 1px solid var(--line);
}
.m-val {
  font-size: 1.7rem;
  font-weight: 700;
  letter-spacing: -0.03em;
}
.m-val em {
  color: var(--faint);
  font-size: 1rem;
  font-style: normal;
  font-weight: 500;
}
.m-k {
  color: var(--faint);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-family: var(--mono);
}

.sec-title {
  font-size: 0.82rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--faint);
  font-family: var(--mono);
  font-weight: 600;
  margin-bottom: 12px;
}

.concepts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-top: 1px solid var(--line);
}
.concept {
  display: flex;
  gap: 18px;
  padding: 18px 4px;
  border-bottom: 1px solid var(--line);
}
.concept:nth-child(odd) {
  padding-right: 24px;
}
.concept:nth-child(even) {
  padding-left: 24px;
  border-left: 1px solid var(--line);
}
.c-k {
  flex: 0 0 88px;
  font-weight: 600;
}
.c-v {
  color: var(--muted);
  font-size: 13.5px;
  line-height: 1.6;
}

.entries {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  border-top: 1px solid var(--line);
}
.entry {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 6px 12px;
  padding: 16px 4px;
  border-bottom: 1px solid var(--line);
  text-decoration: none;
  transition:
    background 0.2s var(--ease),
    transform 0.2s var(--ease);
}
.entry:nth-child(odd) {
  padding-right: 24px;
}
.entry:nth-child(even) {
  padding-left: 24px;
  border-left: 1px solid var(--line);
}
.entry:hover {
  background: rgba(255, 255, 255, 0.02);
}
.e-k {
  font-weight: 600;
}
.e-v {
  grid-column: 1 / 2;
  color: var(--muted);
  font-size: 13px;
}
.e-go {
  grid-row: 1 / 3;
  align-self: center;
  color: var(--accent);
  opacity: 0.6;
  transition: opacity 0.2s var(--ease);
}
.entry:hover .e-go {
  opacity: 1;
}

@media (max-width: 760px) {
  .metrics,
  .concepts,
  .entries {
    grid-template-columns: 1fr;
  }
  .metric + .metric,
  .concept:nth-child(even),
  .entry:nth-child(even) {
    padding-left: 4px;
    border-left: none;
  }
  .concept:nth-child(odd),
  .entry:nth-child(odd) {
    padding-right: 4px;
  }
}
</style>
