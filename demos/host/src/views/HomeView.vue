<script setup lang="ts">
import HelloWorld from '../components/HelloWorld.vue';

const scenarios = [
  {
    to: '/route-b',
    title: '路线 B · createRemoteApp',
    desc: '子应用用自己的 runtime 挂载到宿主容器，shadow: true 启用影子树样式隔离。',
  },
  {
    to: '/import-syntax',
    title: '路线 A · 构建期 import',
    desc: "声明了 preload 的 remote 可直接 `import { HelloWorld } from 'remoteApp'`（含远程库）。",
  },
  {
    to: '/create-remote-component',
    title: '路线 A · createRemoteComponent',
    desc: '一行拿到可用的远程组件，无需构建期 import 配置。',
  },
  {
    to: '/lazy',
    title: '运行时加载 · loadRemote / loadLib',
    desc: '按需（懒）加载：点击时再 `loadRemote` / `loadLib`，用 <component :is> 渲染。',
  },
  {
    to: '/observability',
    title: '可观测 / 预加载',
    desc: '读取快照、强制预加载远端资源，便于排查。',
  },
];
</script>

<template>
  <section class="example">
    <h2>LinkJS 宿主示例</h2>
    <p class="desc">
      每个页面演示一种远程消费方式。远程应用 <code>remoteApp</code>（Vite 8081 / 类型 4002）与远程库
      <code>remote-lib</code>（4001）。
    </p>

    <div class="cards">
      <RouterLink v-for="s in scenarios" :key="s.to" :to="s.to" class="card">
        <h3>{{ s.title }}</h3>
        <p>{{ s.desc }}</p>
      </RouterLink>
    </div>

    <h3>宿主自己的组件</h3>
    <div class="stage"><HelloWorld msg="I am host app!" /></div>
  </section>
</template>

<style scoped>
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 0.75rem;
  margin: 1rem 0;
}
.card {
  display: block;
  padding: 0.9rem 1rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  text-decoration: none;
  color: inherit;
}
.card:hover {
  border-color: #41b883;
  background: #f6fffb;
}
.card h3 {
  margin: 0 0 0.35rem;
  font-size: 0.95rem;
}
.card p {
  margin: 0;
  font-size: 0.82rem;
  color: #6b7280;
}
</style>
