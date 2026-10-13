<script setup lang="ts">
import { computed } from 'vue';
import DepGraph from '../components/DepGraph.vue';
import { useSnapshot } from '../composables/useSnapshot';

const { snapshot } = useSnapshot();
const remotes = computed(() => snapshot.value.remotes || []);
const shares = computed(() => snapshot.value.shares || []);

const facts = [
  {
    k: '拓扑加载',
    v: '远程声明依赖另一远程，运行时按依赖顺序自动加载，先依赖后自身。',
    to: '/topology',
  },
  {
    k: '去重与引用计数',
    v: '同名依赖并发只加载一次；卸载依赖方时按引用计数释放，不误删共享实例。',
    to: '/observability',
  },
  {
    k: '两种消费方式',
    v: '运行时 getRemote 异步取用，或构建期 import { X } from \'<remote>\' 静态消费。',
    to: '/static',
  },
];
</script>

<template>
  <div class="overview">
    <section class="lede rise rise-1">
      <h1>远程依赖，自动拓扑加载</h1>
      <p class="lede-sub">
        宿主只加载一个远程，linkjs 会解析它声明的远程依赖，先加载被依赖方，再加载自身——
        就像本地模块一样自然。
      </p>
    </section>

    <section class="rise rise-2">
      <DepGraph :instance-name="snapshot.instance?.name" :remotes="remotes" :shares="shares" />
    </section>

    <section class="facts rise rise-3">
      <RouterLink v-for="f in facts" :key="f.k" :to="f.to" class="fact">
        <span class="fact-k">{{ f.k }}</span>
        <span class="fact-v">{{ f.v }}</span>
        <span class="fact-go">进入 →</span>
      </RouterLink>
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
  max-width: 720px;
  padding-top: 8px;
}
.lede-sub {
  margin-top: 16px;
  color: var(--muted);
  font-size: clamp(1rem, 1.4vw, 1.15rem);
  line-height: 1.7;
  max-width: 62ch;
}
.facts {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--line);
}
.fact {
  display: grid;
  grid-template-columns: 200px 1fr auto;
  gap: 24px;
  align-items: baseline;
  padding: 20px 4px;
  border-bottom: 1px solid var(--line);
  text-decoration: none;
  transition: background 0.2s var(--ease), transform 0.2s var(--ease);
}
.fact:hover {
  background: rgba(255, 255, 255, 0.02);
  transform: translateX(8px);
}
.fact-k {
  font-weight: 600;
  letter-spacing: -0.01em;
}
.fact-v {
  color: var(--muted);
  font-size: 14px;
  max-width: 64ch;
}
.fact-go {
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  opacity: 0.7;
  transition: opacity 0.2s var(--ease);
}
.fact:hover .fact-go {
  opacity: 1;
}

@media (max-width: 720px) {
  .fact {
    grid-template-columns: 1fr;
    gap: 6px;
  }
}
</style>
