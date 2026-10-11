import { describe, expect, test, vi } from 'vitest';
import { makeEventBus, type LinkjsEvents } from '../src/event-bus';
import { LIB_EXPOSE, REMOTE_UPDATE } from '../src/event-bus/constant';

describe('makeEventBus', () => {
  test('on/emit delivers args', () => {
    const bus = makeEventBus();
    const fn = vi.fn();
    bus.on('x', fn);
    bus.emit('x', 1, 2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1, 2);
  });

  test('once fires only on the first emit', () => {
    const bus = makeEventBus();
    const fn = vi.fn();
    bus.once('x', fn);
    bus.emit('x');
    bus.emit('x');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('off removes a specific listener', () => {
    const bus = makeEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('x', a);
    bus.on('x', b);
    bus.off('x', a);
    bus.emit('x');
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });

  test('off without cb clears all listeners for that event', () => {
    const bus = makeEventBus();
    const a = vi.fn();
    bus.on('x', a);
    bus.on('y', a);
    bus.off('x');
    bus.emit('x');
    bus.emit('y');
    expect(a).toHaveBeenCalledTimes(1);
  });

  test('clear removes every listener', () => {
    const bus = makeEventBus();
    const fn = vi.fn();
    bus.on('x', fn);
    bus.on('y', fn);
    bus.clear();
    bus.emit('x');
    bus.emit('y');
    expect(fn).not.toHaveBeenCalled();
  });

  test('typed bus (LinkjsEvents) delivers the declared payloads', () => {
    const bus = makeEventBus<LinkjsEvents>();
    const onExpose = vi.fn();
    const onUpdate = vi.fn();
    bus.on(LIB_EXPOSE, onExpose);
    bus.on(REMOTE_UPDATE, onUpdate);

    bus.emit(LIB_EXPOSE, { libName: 'app', lib: { default: 1 } });
    bus.emit(REMOTE_UPDATE, { appName: 'app', key: 'Hello' });

    expect(onExpose).toHaveBeenCalledWith({ libName: 'app', lib: { default: 1 } });
    expect(onUpdate).toHaveBeenCalledWith({ appName: 'app', key: 'Hello' });
  });

  test('listeners added during emit do not run in the same dispatch', () => {
    const bus = makeEventBus();
    const late = vi.fn();
    bus.on('x', () => bus.on('x', late));
    bus.emit('x');
    expect(late).not.toHaveBeenCalled();
    bus.emit('x');
    expect(late).toHaveBeenCalledTimes(1);
  });
});
