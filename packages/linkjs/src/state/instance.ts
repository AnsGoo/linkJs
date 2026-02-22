import { makeEventBus } from '../event-bus';
import { __LINKJS_INSTANCE__, __LINKJS_OVERRIDES__ } from '../constant';
import { LIB_EXPOSE, LOAD_STATUS } from '../event-bus/constant';
import type { RuntimePlugin } from '../plugins';
import { getShare } from '../share';
import type { Module } from 'module';

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

export type RemoteInfo = RemoteApp | RemoteLib;

export type RegistryOption = Omit<RemoteInfo, 'status'>;

interface ShareInfo {
  name: string;
  version?: string;
  lib: Module | (() => Promise<Module>) | (() => Module);
  status: keyof typeof LOAD_STATUS;
  scope?: string;
  module?: Module;
  singleton?: boolean;
}

export type ShareOption = Omit<ShareInfo, 'status' | 'module'>;

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
    shares: new Map<string, Map<string, ShareInfo>>(),
    sharedMap: new Map<string, Map<string, Module>>(),
    remotes: new Map<string, RemoteInfo>(),
    plugin: {} as RuntimePlugin,

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
    expose(libName: string, lib: any, options: any) {
      eventBus.emit(LIB_EXPOSE, {
        libName,
        lib,
        options,
      });
    },
    getShare: getShare,
  };
  // @ts-ignore
  globalThis[__LINKJS_INSTANCE__] = linkInstance;
}
// @ts-ignore
globalThis[__LINKJS_INSTANCE__] = linkInstance;
// @ts-ignore
globalThis['$linkjs'] = {
  debug: {
    config: (content: Record<string, string>) => {
      localStorage.setItem(__LINKJS_OVERRIDES__, JSON.stringify(content));
    },
  },
  expose: linkInstance.expose,
  getShare: linkInstance.getShare,
};
export { linkInstance };
