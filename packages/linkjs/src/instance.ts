import { makeEventBus } from './event-bus';
import { __LINKJS_INSTANCE__ } from './constant';
import type { LOAD_STATUS } from './event-bus/constant';
import type { RuntimePlugin } from './plugins';

// 检查 window 对象上是否已经存在 linkjs 实例

interface RemoteInfo {
  entry: string;
  dependencies?: Record<string, string>;
  version?: string;
  export?: Record<string, any>;
  status: keyof typeof LOAD_STATUS;
}

// @ts-ignore
let linkInstance: any = typeof window !== 'undefined' && window[__LINKJS_INSTANCE__] ? window[__LINKJS_INSTANCE__] : null;

if (!linkInstance) {
  const eventBus = makeEventBus();

  linkInstance = {
    eventBus,
    version: '1.0.0',
    name: 'linkjs',
    apps: new Map(),
    libs: new Map(),
    shares: new Map(),
    remotes: new Map<string, RemoteInfo>(),
    plugins: [] as RuntimePlugin[],

    // 应用管理方法
    registerApp(appName: string, app: any): void {
      this.apps.set(appName, app);
    },

    unregisterApp(appName: string): void {
      this.apps.delete(appName);
    },

    getApp(appName: string): any {
      return this.apps.get(appName);
    },

    // 库管理方法
    registerLib(libName: string, lib: any): void {
      this.libs.set(libName, lib);
    },

    unregisterLib(libName: string): void {
      this.libs.delete(libName);
    },

    getLib(libName: string): any {
      return this.libs.get(libName);
    },

    // 初始化方法
    init(): void {
      console.log(`${this.name} v${this.version} initialized`);
    },

    // 销毁方法
    destroy(): void {
      this.apps.clear();
      this.libs.clear();
      console.log(`${this.name} destroyed`);
    },

    // 清除缓存方法
    clearCache(): void {
      // 清除所有应用的缓存
      this.apps.clear();
      this.libs.clear();
      console.log(`${this.name} cache cleared`);
    },
  };

  // @ts-ignore
  if (typeof window !== 'undefined') {
    // @ts-ignore
    window[__LINKJS_INSTANCE__] = linkInstance;
  }
}

export { linkInstance };
