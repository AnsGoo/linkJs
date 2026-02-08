export interface EventBus {
  on: (eventName: string, cb: Function) => void;
  emit: (eventName: string, ...args: any[]) => void;
  off: (eventName: string, cb: Function) => void;
}

export function makeEventBus(): EventBus {
  const name2listeners: Record<string, Function[]> = {};
  return {
    on: (eventName: string, cb: Function) => {
      let listeners = name2listeners[eventName];
      if (!listeners) {
        const arr: Function[] = [];
        name2listeners[eventName] = arr;
        listeners = arr;
      }
      listeners.push(cb);
    },
    emit: (eventName: string, ...args: any[]) => {
      const listeners = name2listeners[eventName];
      if (listeners) {
        const listenersCopy = listeners.slice();
        listenersCopy.forEach((cb) => cb(...args));
      }
    },
    off: (eventName: string, cb: Function) => {
      const listeners = name2listeners[eventName];
      if (listeners) {
        for (let i = 0, len = listeners.length; i < len; i++) {
          const cbItem = listeners[i];
          if (cbItem === cb) {
            listeners.splice(i, 1);
            break;
          }
        }
      }
    },
  };
}
