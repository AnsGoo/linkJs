import type { RemoteModule } from '../types';
import { LIB_EXPOSE, SHARED_EXPOSE, LIB_READY, SHARED_READY, REMOTE_UPDATE } from './constant';

/** linkjs 事件与负载类型（供 `EventBus` 泛型使用）。 */
export interface LinkjsEvents {
  [LIB_EXPOSE]: [payload: { libName: string; lib: RemoteModule; options?: unknown }];
  [SHARED_EXPOSE]: [payload: { libName: string; shared: unknown; options?: unknown }];
  [LIB_READY]: [payload?: unknown];
  [SHARED_READY]: [payload?: unknown];
  [REMOTE_UPDATE]: [payload: { appName: string; key?: string }];
}

/** 默认事件表：宽松类型，允许自定义事件名。 */
export type EventMap = Record<string, any[]>;

export type EventHandler<TArgs extends any[] = any[]> = (...args: TArgs) => void;

/** 事件名对应的事件参数元组（非数组退化为 `never`）。 */
type EventArgs<Events, K extends keyof Events> = Events[K] extends any[] ? Events[K] : never;

export interface EventBus<Events extends object = EventMap> {
  /** 订阅事件。 */
  on<K extends keyof Events & string>(eventName: K, cb: EventHandler<EventArgs<Events, K>>): void;
  /** 订阅一次，触发后自动取消。 */
  once<K extends keyof Events & string>(eventName: K, cb: EventHandler<EventArgs<Events, K>>): void;
  /** 取消订阅；省略 `cb` 时清空该事件的**所有**监听。 */
  off<K extends keyof Events & string>(eventName: K, cb?: EventHandler<EventArgs<Events, K>>): void;
  /** 触发事件。 */
  emit<K extends keyof Events & string>(eventName: K, ...args: EventArgs<Events, K>): void;
  /** 清空所有事件的所有监听。 */
  clear(): void;
}

export function makeEventBus<Events extends object = EventMap>(): EventBus<Events> {
  type Listener = (...args: any[]) => void;
  const name2listeners: Record<string, Listener[]> = {};

  const off = (eventName: string, cb?: Listener) => {
    const listeners = name2listeners[eventName];
    if (!listeners) {
      return;
    }
    if (!cb) {
      delete name2listeners[eventName];
      return;
    }
    for (let i = 0, len = listeners.length; i < len; i++) {
      if (listeners[i] === cb) {
        listeners.splice(i, 1);
        break;
      }
    }
    if (listeners.length === 0) {
      delete name2listeners[eventName];
    }
  };

  return {
    on(eventName, cb) {
      (name2listeners[eventName] ??= []).push(cb as Listener);
    },
    once(eventName, cb) {
      const wrapper: Listener = (...args) => {
        off(eventName, wrapper);
        (cb as Listener)(...args);
      };
      (name2listeners[eventName] ??= []).push(wrapper);
    },
    off: off as EventBus<Events>['off'],
    emit(eventName, ...args) {
      const listeners = name2listeners[eventName];
      if (listeners) {
        // 复制一份，避免监听器在回调中被增删影响本次派发
        listeners.slice().forEach((cb) => cb(...args));
      }
    },
    clear() {
      for (const key of Object.keys(name2listeners)) {
        delete name2listeners[key];
      }
    },
  };
}
