import { getInstance, registerShare } from 'linkjs';

// 宿主（主应用）通常已经注册了共享依赖；此时不要覆盖，保证子应用命中宿主的实例。
// 只有在独立运行（没有宿主）时才注册本地回退版本。
const scope = getInstance().shares.get('global');
const has = (name: string) => Boolean(scope && scope.has(name));

const fallback: Record<string, any> = {};
if (!has('vue')) {
  fallback.vue = { name: 'vue', version: '3.5.27', lib: () => import('vue') };
}
if (!has('pinia')) {
  fallback.pinia = { name: 'pinia', version: '3.0.4', lib: () => import('pinia') };
}
if (!has('vue-router')) {
  fallback['vue-router'] = { name: 'vue-router', version: '5.0.1', lib: () => import('vue-router') };
}

registerShare(fallback);
