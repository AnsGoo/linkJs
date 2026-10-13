<script setup lang="ts">
import { computed } from 'vue';
import Icon from './components/Icon.vue';
import { useSnapshot } from './composables/useSnapshot';

const { snapshot } = useSnapshot(1200);

const nav = [
  { to: '/', label: '总览', icon: 'grid' },
  { to: '/runtime', label: '运行时加载', icon: 'play' },
  { to: '/static', label: '构建期 import', icon: 'zap' },
  { to: '/topology', label: '依赖拓扑', icon: 'flow' },
  { to: '/preload', label: '路由级预取', icon: 'download' },
  { to: '/sources', label: '多源灰度', icon: 'network' },
  { to: '/shadow', label: 'Shadow 隔离', icon: 'box' },
  { to: '/plugins', label: '插件机制', icon: 'zap' },
  { to: '/types', label: '类型转发', icon: 'link' },
  { to: '/hmr', label: 'HMR 热更新', icon: 'spark' },
  { to: '/observability', label: '可观测', icon: 'activity' },
];

const instanceId = computed(() => snapshot.value.instance?.id || '—');
const mode = computed(() => snapshot.value.instance?.mode || '—');
const loadedCount = computed(() => (snapshot.value.remotes || []).filter((r) => r.status === 'loaded').length);
const totalCount = computed(() => (snapshot.value.remotes || []).length);
const hasError = computed(() => (snapshot.value.diagnostics || []).some((d) => d.level === 'error'));
</script>

<template>
  <div class="shell">
    <aside class="rail">
      <RouterLink to="/" class="brand" aria-label="LinkJS 首页">
        <span class="brand-mark">L</span>
        <span class="brand-name">LinkJS</span>
      </RouterLink>

      <nav class="nav">
        <RouterLink v-for="n in nav" :key="n.to" :to="n.to" class="nav-item" active-class="active" :end="n.to === '/'">
          <Icon :name="n.icon" />
          <span>{{ n.label }}</span>
        </RouterLink>
      </nav>

      <div class="rail-foot">
        <span class="mono faint">v{{ snapshot.instance?.version || '1.0.0' }}</span>
      </div>
    </aside>

    <div class="stage">
      <header class="status">
        <div class="status-left">
          <span class="mono id">{{ instanceId }}</span>
          <span class="sep" />
          <span class="mono faint">mode {{ mode }}</span>
        </div>
        <div class="status-right">
          <span class="count mono">
            <b>{{ loadedCount }}</b><span class="faint">/{{ totalCount }} remotes</span>
          </span>
          <span class="live-dot" :class="{ err: hasError }" />
        </div>
      </header>

      <main class="content">
        <RouterView v-slot="{ Component }">
          <Transition name="page" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-columns: 224px 1fr;
  min-height: 100vh;
}

.rail {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 22px 16px;
  border-right: 1px solid var(--line);
  position: sticky;
  top: 0;
  height: 100vh;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  padding: 2px 6px;
}
.brand-mark {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--accent);
  color: var(--accent-ink);
  font-weight: 800;
  font-size: 15px;
}
.brand-name {
  font-weight: 700;
  letter-spacing: -0.02em;
  font-size: 15px;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: 9px;
  text-decoration: none;
  color: var(--muted);
  font-size: 13.5px;
  font-weight: 500;
  position: relative;
  transition: color 0.18s var(--ease), background 0.18s var(--ease);
}
.nav-item:hover {
  color: var(--text);
  background: rgba(255, 255, 255, 0.03);
}
.nav-item.active {
  color: var(--text);
  background: rgba(255, 255, 255, 0.04);
}
.nav-item.active::before {
  content: '';
  position: absolute;
  left: -16px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 18px;
  border-radius: 0 3px 3px 0;
  background: var(--accent);
}
.rail-foot {
  margin-top: auto;
  padding: 0 10px;
  font-size: 11px;
}

.stage {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 32px;
  border-bottom: 1px solid var(--line);
  position: sticky;
  top: 0;
  backdrop-filter: blur(12px);
  background: color-mix(in oklab, var(--bg) 72%, transparent);
  z-index: 5;
}
.status-left,
.status-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
.id {
  font-size: 12.5px;
  color: var(--text);
}
.sep {
  width: 1px;
  height: 14px;
  background: var(--line-strong);
}
.count {
  font-size: 12px;
  color: var(--muted);
}
.count b {
  color: var(--text);
}
.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 4px color-mix(in oklab, var(--accent) 16%, transparent);
}
.live-dot.err {
  background: var(--danger);
  box-shadow: 0 0 0 4px color-mix(in oklab, var(--danger) 18%, transparent);
}

.content {
  padding: 36px 32px 80px;
  max-width: var(--maxw);
  width: 100%;
}

.page-enter-active,
.page-leave-active {
  transition: opacity 0.24s var(--ease), transform 0.24s var(--ease), filter 0.24s var(--ease);
}
.page-enter-from {
  opacity: 0;
  transform: translateY(10px);
  filter: blur(4px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@media (max-width: 860px) {
  .shell {
    grid-template-columns: 1fr;
  }
  .rail {
    position: static;
    height: auto;
    flex-direction: row;
    align-items: center;
    gap: 8px;
    border-right: none;
    border-bottom: 1px solid var(--line);
    overflow-x: auto;
    scrollbar-width: none;
  }
  .rail::-webkit-scrollbar {
    display: none;
  }
  .brand-name {
    display: none;
  }
  .nav {
    flex-direction: row;
    flex-wrap: nowrap;
  }
  .nav-item {
    white-space: nowrap;
  }
  .nav-item.active::before {
    display: none;
  }
  .rail-foot {
    display: none;
  }
  .content {
    padding: 24px 18px 60px;
  }
  .status {
    padding: 12px 18px;
  }
}
</style>
