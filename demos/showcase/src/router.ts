import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'overview', component: () => import('./views/OverviewView.vue'), meta: { label: '总览' } },
    { path: '/runtime', name: 'runtime', component: () => import('./views/RuntimeView.vue'), meta: { label: '运行时加载' } },
    { path: '/static', name: 'static', component: () => import('./views/StaticView.vue'), meta: { label: '构建期 import' } },
    { path: '/topology', name: 'topology', component: () => import('./views/TopologyView.vue'), meta: { label: '依赖拓扑' } },
    { path: '/preload', name: 'preload', component: () => import('./views/PreloadView.vue'), meta: { label: '路由级预取' } },
    { path: '/sources', name: 'sources', component: () => import('./views/SourcesView.vue'), meta: { label: '多源灰度' } },
    { path: '/shadow', name: 'shadow', component: () => import('./views/ShadowView.vue'), meta: { label: 'Shadow 隔离' } },
    { path: '/observability', name: 'observability', component: () => import('./views/ObservabilityView.vue'), meta: { label: '可观测' } },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

export default router;
