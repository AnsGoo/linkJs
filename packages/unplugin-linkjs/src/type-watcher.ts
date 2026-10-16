import type { RemoteTypeInfo } from './consume-types.js';
import type { ConsumeTypesOptions } from './types.js';

export interface SseEvent {
  event: string;
  data: string;
}

/** 解析单个 SSE 事件块（`\n\n` 分隔后的一段）。 */
function parseSseChunk(chunk: string): SseEvent | null {
  let event = 'message';
  const data: string[] = [];
  for (const rawLine of chunk.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line || line.startsWith(':')) {
      continue;
    }
    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    const value = idx === -1 ? '' : line.slice(idx + 1).replace(/^ /, '');
    if (field === 'event') {
      event = value;
    } else if (field === 'data') {
      data.push(value);
    }
  }
  if (data.length === 0 && event === 'message') {
    return null;
  }
  return { event, data: data.join('\n') };
}

export interface TypeChangeEvent {
  name: string;
  typesHash?: string;
}

export interface TypeWatcher {
  close(): void;
}

interface ResolvedReconnect {
  minDelay: number;
  maxDelay: number;
  factor: number;
}

const DEFAULT_RECONNECT: ResolvedReconnect = { minDelay: 1000, maxDelay: 30000, factor: 2 };

function eventsUrlFor(manifestUrl: string): string {
  return new URL('/__linkjs/events', manifestUrl).href;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * 订阅单个远程的类型变更事件流（SSE）。
 *
 * - 连接建立后持续读取 `text/event-stream`；`snapshot` / `types-changed` 事件触发 `onChange`；
 * - 断线按指数退避重连；`close()` 终止并中止在途请求。
 */
async function watchRemoteEvents(
  info: RemoteTypeInfo,
  options: ConsumeTypesOptions,
  reconnect: ResolvedReconnect,
  onChange: (event: TypeChangeEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const fetchImpl = options.fetch ?? fetch;
  const url = eventsUrlFor(info.manifestUrl);

  let delay = reconnect.minDelay;
  while (!signal.aborted) {
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: 'text/event-stream' },
        signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`SSE ${response.status}`);
      }
      delay = reconnect.minDelay;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const event = parseSseChunk(chunk);
          if (!event) {
            continue;
          }
          if (event.event === 'snapshot' || event.event === 'types-changed') {
            let payload: { typesHash?: string } = {};
            try {
              payload = JSON.parse(event.data);
            } catch {
              /* ignore malformed */
            }
            onChange({ name: info.name, typesHash: payload.typesHash });
          }
        }
      }
    } catch {
      /* 连接失败/中断：走退避重连 */
    }
    if (signal.aborted) {
      break;
    }
    await sleep(delay, signal);
    delay = Math.min(delay * reconnect.factor, reconnect.maxDelay);
  }
}

/**
 * 为一个或多个 dev 远程建立类型变更订阅（生产者处于 development 模式时使用）。
 *
 * `onChange` 会在收到 `snapshot` / `types-changed`（hash 有变化）时被调用，
 * 由调用方决定增量/全量刷新类型。
 */
function watchRemoteTypes(infos: RemoteTypeInfo[], options: ConsumeTypesOptions, onChange: (event: TypeChangeEvent) => void): TypeWatcher {
  const reconnect: ResolvedReconnect = { ...DEFAULT_RECONNECT, ...options.reconnect };
  const controller = new AbortController();

  for (const info of infos) {
    void watchRemoteEvents(
      info,
      options,
      reconnect,
      (event) => {
        // 与已知 hash 相同则跳过（幂等去重）。
        if (event.typesHash && event.typesHash === info.typesHash) {
          return;
        }
        onChange(event);
      },
      controller.signal,
    );
  }

  return {
    close() {
      controller.abort();
    },
  };
}

export { watchRemoteTypes, parseSseChunk, eventsUrlFor };
