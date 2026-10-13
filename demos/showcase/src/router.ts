import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'overview', component: () => import('./views/OverviewView.vue'), meta: { label: '总览' } },
    { path: '/runtime', name: 'runtime', component: () => import('./views/RuntimeView.vue'), meta: { label: '运行时加载' } },
    { path: '/static', name: 'static', component: () => import('./views/StaticView.vue'), meta: { label: '构建期 import' } },
    { path: '/topology', name: 'topology', component: () => import('./views/TopologyView.vue'), meta: { label: '依赖拓扑' } },
    { path: '/observability', name: 'observability', component: () => import('./views/ObservabilityView.vue'), meta: { label: '可观测' } },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

export default router;
