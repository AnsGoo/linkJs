import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'overview', component: () => import('../views/HomeView.vue') },
    { path: '/route-b', name: 'route-b', component: () => import('../views/examples/RouteBView.vue') },
    { path: '/import-syntax', name: 'import-syntax', component: () => import('../views/examples/ImportSyntaxView.vue') },
    {
      path: '/create-remote-component',
      name: 'create-remote-component',
      component: () => import('../views/examples/CreateRemoteComponentView.vue'),
    },
    { path: '/lazy', name: 'lazy', component: () => import('../views/examples/LazyLoadView.vue') },
    { path: '/observability', name: 'observability', component: () => import('../views/examples/ObservabilityView.vue') },
  ],
});

export default router;
