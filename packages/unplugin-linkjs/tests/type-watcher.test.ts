import { describe, expect, it, vi } from 'vitest';
import type { RemoteTypeInfo } from '../src/consume-types';
import { eventsUrlFor, parseSseChunk, watchRemoteTypes } from '../src/type-watcher';

function info(typesHash: string): RemoteTypeInfo {
  return {
    name: 'remoteApp',
    manifestUrl: 'http://cdn/manifest.json',
    typesUrl: 'http://cdn/lib.d.ts',
    typesHash,
    cacheRel: 'remoteApp/lib.d.ts',
    exposes: ['HelloWorld'],
    mode: 'development',
    content: 'export declare const HelloWorld: number;\n',
  };
}

function sseStream(frames: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < frames.length) {
        controller.enqueue(encoder.encode(frames[i++]));
      } else {
        controller.close();
      }
    },
  });
}

describe('parseSseChunk', () => {
  it('parses a types-changed event', () => {
    expect(parseSseChunk('event: types-changed\ndata: {"typesHash":"h"}')).toEqual({
      event: 'types-changed',
      data: '{"typesHash":"h"}',
    });
  });

  it('ignores comment-only chunks', () => {
    expect(parseSseChunk(': ping')).toBeNull();
  });

  it('joins multi-line data and keeps the default message event', () => {
    expect(parseSseChunk('data: a\ndata: b')).toEqual({ event: 'message', data: 'a\nb' });
  });
});

describe('eventsUrlFor', () => {
  it('derives the events endpoint from the manifest url', () => {
    expect(eventsUrlFor('http://cdn/manifest.json')).toBe('http://cdn/__linkjs/events');
  });
});

describe('watchRemoteTypes', () => {
  it('emits a change event with a new typesHash', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      body: sseStream(['event: types-changed\ndata: {"name":"remoteApp","typesHash":"h2"}\n\n']),
    })) as unknown as typeof fetch;
    const onChange = vi.fn();

    const watcher = watchRemoteTypes([info('h1')], { remotes: [], fetch: fetchImpl }, onChange);
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith({ name: 'remoteApp', typesHash: 'h2' }));
    watcher.close();
  });

  it('ignores events whose hash matches the known one (idempotent)', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      body: sseStream(['event: snapshot\ndata: {"typesHash":"h1"}\n\n']),
    })) as unknown as typeof fetch;
    const onChange = vi.fn();

    const watcher = watchRemoteTypes([info('h1')], { remotes: [], fetch: fetchImpl }, onChange);
    await new Promise((r) => setTimeout(r, 30));
    expect(onChange).not.toHaveBeenCalled();
    watcher.close();
  });
});
