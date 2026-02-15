import { makeEventBus } from '../event-bus';
import { __LINKJS_INSTANCE__, __LINKJS_OVERRIDES__ } from '../constant';
import { LIB_EXPOSE, LOAD_STATUS } from '../event-bus/constant';
import type { RuntimePlugin } from '../plugins';

// 检查 window 对象上是否已经存在 linkjs 实例

export interface RemoteBase {
  name: string;
  entry: string;
  host?: string;
  type?: 'app' | 'lib';
  dependencies?: Record<string, string>;
  version?: string;
  expose?: Record<string, any>;
  status: keyof typeof LOAD_STATUS;
}

export interface RemoteApp extends RemoteBase {
  type: 'app';
  i18n?: Record<string, string>;
  css?: string[];
}

export interface RemoteLib extends RemoteBase {
  type: 'lib';
}

export type RegistryOption = Omit<RemoteApp | RemoteLib, 'status'>;

// @ts-ignore
let linkInstance: any = typeof globalThis !== 'undefined' && globalThis[__LINKJS_INSTANCE__] ? globalThis[__LINKJS_INSTANCE__] : null;

if (!linkInstance) {
  const eventBus = makeEventBus();

  linkInstance = {
    eventBus,
    version: '1.0.0',
    name: 'linkjs',
    apps: new Map(),
    libs: new Map(),
    shares: new Map(),
    remotes: new Map<string, RemoteApp | RemoteLib>(),
    plugins: [] as RuntimePlugin[],

    loadRegistry(registryOptions: RegistryOption[]): void {
      registryOptions.forEach((option) => {
        const info = {
          ...option,
          status: LOAD_STATUS.UNLOADED,
        };
        if (info.type === 'app') {
          this.remotes.set(info.name, info as RemoteApp);
        } else if (info.type === 'lib') {
          this.remotes.set(info.name, info as RemoteLib);
        }
      });
    },

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
    exposeLib(libName: string, lib: any, options: any) {
      eventBus.emit(LIB_EXPOSE, {
        libName,
        lib,
        options,
      });
    }
  };

  // @ts-ignore
  if (typeof window !== 'undefined') {
    // @ts-ignore
    globalThis[__LINKJS_INSTANCE__] = linkInstance;
  }
}
// @ts-ignore
globalThis[__LINKJS_INSTANCE__] = linkInstance;
// @ts-ignore
window['$linkjs'] = {
  debug: {
    config: (content: Record<string, string>) => {
      localStorage.setItem(__LINKJS_OVERRIDES__, JSON.stringify(content));
    },
  },
  exposeLib: linkInstance.exposeLib,
};
export { linkInstance };
