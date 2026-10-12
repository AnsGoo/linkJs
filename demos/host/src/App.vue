<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router';

const examples = [
  { to: '/', label: '概览' },
  { to: '/route-b', label: '路线 B · createRemoteApp' },
  { to: '/import-syntax', label: '路线 A · 构建期 import' },
  { to: '/create-remote-component', label: '路线 A · createRemoteComponent' },
  { to: '/lazy', label: '运行时加载 · loadRemote / loadLib' },
  { to: '/observability', label: '可观测 / 预加载' },
];
</script>

<template>
  <div class="layout">
    <aside class="sidebar">
      <h1 class="brand">LinkJS Host 示例</h1>
      <nav class="nav">
        <RouterLink v-for="item in examples" :key="item.to" :to="item.to" class="nav-link">
          {{ item.label }}
        </RouterLink>
      </nav>
    </aside>
    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.layout {
  display: flex;
  min-height: 100vh;
}

.sidebar {
  width: 260px;
  flex: 0 0 260px;
  padding: 1.5rem 1rem;
  border-right: 1px solid var(--color-border, #e5e7eb);
  background: #f8fafc;
}

.brand {
  margin: 0 0 1rem;
  font-size: 1.1rem;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.nav-link {
  display: block;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  color: inherit;
  text-decoration: none;
  font-size: 0.9rem;
}

.nav-link:hover {
  background: #eef2ff;
}

.nav-link.router-link-exact-active {
  background: #41b883;
  color: #fff;
}

.content {
  flex: 1;
  padding: 2rem;
  max-width: 900px;
}
</style>
