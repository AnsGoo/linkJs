import { getCurrentScope, onScopeDispose, shallowRef, type Component, type ShallowRef } from 'vue';
import { getRemote, loadApp, subscribeRemoteUpdate, type LoadAppOptions } from './index';

/**
 * 宿主消费远程组件并响应式重解析 expose。
 *
 * 返回的 ref 在远程应用 re-expose（入口变化）或组件对象被 HMR 替换时自动更新，
 * 宿主用 `<component :is="comp" />` 即可无刷新切换。
 */
function useRemoteModule<C = Component>(entry: string, options?: LoadAppOptions): ShallowRef<C | null> {
  const appName = entry.split('/')[0];
  const ref = shallowRef<C | null>(null) as ShallowRef<C | null>;

  const resolve = () => {
    ref.value = (getRemote(entry) as C) ?? null;
  };

  loadApp(appName, options).then(resolve).catch((error) => {
    console.error(`[linkjs] Failed to load remote "${entry}":`, error);
  });

  const off = subscribeRemoteUpdate(entry, resolve);
  if (getCurrentScope()) {
    onScopeDispose(off);
  }

  return ref;
}

export { useRemoteModule };
