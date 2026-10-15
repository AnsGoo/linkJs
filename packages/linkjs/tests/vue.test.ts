// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, defineComponent, effectScope, h, nextTick, type Component } from 'vue';

const mocks = vi.hoisted(() => ({
  loadApp: vi.fn(),
  loadRemote: vi.fn(),
  getRemote: vi.fn(),
  retainExpose: vi.fn(),
  releaseExpose: vi.fn(),
  subscribeRemoteUpdate: vi.fn<(entry: string, cb: () => void) => () => void>(() => () => {}),
}));

vi.mock('../src/index', () => ({
  loadApp: mocks.loadApp,
  loadRemote: mocks.loadRemote,
  getRemote: mocks.getRemote,
  retainExpose: mocks.retainExpose,
  releaseExpose: mocks.releaseExpose,
  subscribeRemoteUpdate: mocks.subscribeRemoteUpdate,
}));

import { useRemoteModule, createRemoteApp, createRemoteComponent, LinkjsShadowRoot } from '../src/vue';

const Hello = defineComponent({ name: 'Hello', setup: () => () => h('span', 'hello') });

function flush(times = 5): Promise<void> {
  let p = Promise.resolve();
  for (let i = 0; i < times; i++) {
    p = p.then(() => nextTick());
  }
  return p;
}

let container: HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  vi.clearAllMocks();
  mocks.subscribeRemoteUpdate.mockImplementation(() => () => {});
});

afterEach(() => {
  container.remove();
  vi.restoreAllMocks();
});

describe('useRemoteModule', () => {
  it('resolves the exposed component after loadApp completes', async () => {
    mocks.loadApp.mockResolvedValue({});
    mocks.getRemote.mockReturnValue(Hello);

    const scope = effectScope();
    const ref = scope.run(() => useRemoteModule<Component>('remote/Hello'))!;
    expect(ref.value).toBeNull();

    await flush();
    expect(mocks.loadApp).toHaveBeenCalledWith('remote', { shadow: false });
    expect(ref.value).toBe(Hello);
    scope.stop();
  });

  it('re-resolves when the remote updates', async () => {
    mocks.loadApp.mockResolvedValue({});
    mocks.getRemote.mockReturnValue(Hello);
    let updateCb: (() => void) | undefined;
    mocks.subscribeRemoteUpdate.mockImplementation((_entry, cb) => {
      updateCb = cb;
      return () => {};
    });

    const scope = effectScope();
    const ref = scope.run(() => useRemoteModule<Component>('remote/Hello'))!;
    await flush();

    const Replaced = defineComponent({ name: 'Replaced', setup: () => () => h('i') });
    mocks.getRemote.mockReturnValue(Replaced);
    updateCb!();
    await flush();
    expect(ref.value).toBe(Replaced);
    scope.stop();
  });

  it('unsubscribes on scope dispose', async () => {
    mocks.loadApp.mockResolvedValue({});
    mocks.getRemote.mockReturnValue(Hello);
    const off = vi.fn();
    mocks.subscribeRemoteUpdate.mockReturnValue(off);

    const scope = effectScope();
    scope.run(() => useRemoteModule<Component>('remote/Hello'));
    scope.stop();
    expect(off).toHaveBeenCalled();
  });

  it('keeps null and logs when loadApp fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.loadApp.mockRejectedValue(new Error('boom'));

    const scope = effectScope();
    const ref = scope.run(() => useRemoteModule<Component>('remote/Hello'))!;
    await flush();

    expect(ref.value).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    scope.stop();
  });
});

describe('createRemoteApp', () => {
  it('mounts the remote module into the host element with attrs', async () => {
    const mount = vi.fn();
    const unmount = vi.fn();
    mocks.loadApp.mockResolvedValue({ mount, unmount });

    const RemoteApp = createRemoteApp('remote');
    const app = createApp(RemoteApp, { msg: 'hi' });
    app.mount(container);
    await flush();

    expect(mocks.loadApp).toHaveBeenCalledWith('remote', expect.objectContaining({ shadow: true }));
    expect(mount).toHaveBeenCalledTimes(1);
    const [el, attrs] = mount.mock.calls[0];
    expect(el).toBeInstanceOf(HTMLElement);
    expect(attrs).toMatchObject({ msg: 'hi' });

    app.unmount();
    expect(unmount).toHaveBeenCalled();
  });

  it('renders the loading placeholder until the module is ready', async () => {
    let resolveLoad: (value: unknown) => void = () => {};
    mocks.loadApp.mockReturnValue(new Promise((r) => (resolveLoad = r)));
    const Loading = defineComponent({ name: 'Loading', setup: () => () => h('div', { class: 'loading' }, '加载中') });

    const RemoteApp = createRemoteApp('remote', { loading: Loading });
    const app = createApp(RemoteApp);
    app.mount(container);
    await flush();
    expect(container.querySelector('.loading')?.textContent).toBe('加载中');

    resolveLoad({ mount: vi.fn(), unmount: vi.fn() });
    await flush();
    expect(container.querySelector('.loading')).toBeNull();
    app.unmount();
  });

  it('renders the error placeholder and calls onError on failure', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = new Error('boom');
    mocks.loadApp.mockRejectedValue(boom);
    const onError = vi.fn();
    const ErrorBox = defineComponent({
      name: 'ErrorBox',
      props: { error: { type: Error, required: true } },
      setup: (props) => () => h('div', { class: 'err' }, String(props.error.message)),
    });

    const RemoteApp = createRemoteApp('remote', { error: ErrorBox, onError });
    const app = createApp(RemoteApp);
    app.mount(container);
    await flush();

    expect(container.querySelector('.err')?.textContent).toBe('boom');
    expect(onError).toHaveBeenCalledWith(boom);
    expect(errorSpy).toHaveBeenCalled();
    app.unmount();
  });

  it('remounts when the remote entry updates', async () => {
    const mount = vi.fn();
    const unmount = vi.fn();
    mocks.loadApp.mockResolvedValue({ mount, unmount });
    let updateCb: (() => void) | undefined;
    mocks.subscribeRemoteUpdate.mockImplementation((_entry, cb) => {
      updateCb = cb;
      return () => {};
    });

    const RemoteApp = createRemoteApp('remote');
    const app = createApp(RemoteApp);
    app.mount(container);
    await flush();
    expect(mount).toHaveBeenCalledTimes(1);

    await updateCb!();
    await flush();
    expect(unmount).toHaveBeenCalledTimes(1);
    expect(mount).toHaveBeenCalledTimes(2);
    app.unmount();
  });

  it('skips shadow isolation when shadow: false', async () => {
    const mount = vi.fn();
    mocks.loadApp.mockResolvedValue({ mount, unmount: vi.fn() });

    const RemoteApp = createRemoteApp('remote', { shadow: false });
    const app = createApp(RemoteApp);
    app.mount(container);
    await flush();

    expect(mocks.loadApp).toHaveBeenCalledWith('remote', expect.objectContaining({ shadow: false }));
    expect(container.querySelector(':scope > div')).toBeTruthy();
    expect((container.firstElementChild as HTMLElement).shadowRoot).toBeNull();
    app.unmount();
  });
});

describe('createRemoteComponent', () => {
  it('loads with shadow by default and renders the component with attrs', async () => {
    mocks.loadRemote.mockResolvedValue({});
    mocks.getRemote.mockReturnValue(
      defineComponent({
        name: 'RemoteHello',
        props: { msg: { type: String, default: '' } },
        setup: (props) => () => h('span', { class: 'remote' }, props.msg),
      }),
    );

    const RemoteHello = createRemoteComponent('remote/Hello');
    const app = createApp(RemoteHello, { msg: 'world' });
    app.mount(container);
    await flush();

    expect(mocks.loadRemote).toHaveBeenCalledWith('remote/Hello', expect.objectContaining({ shadow: true }));
    expect(mocks.retainExpose).toHaveBeenCalledWith('remote/Hello');
    // 默认隔离：内容经 Teleport 进入影子树（影子宿主是组件容器内层的 div）
    const host = Array.from(container.querySelectorAll('div')).find((d) => d.shadowRoot);
    expect(host).toBeTruthy();
    expect(host!.shadowRoot!.querySelector('.remote')?.textContent).toBe('world');

    app.unmount();
    expect(mocks.releaseExpose).toHaveBeenCalledWith('remote/Hello');
  });

  it('renders inline when shadow: false', async () => {
    mocks.loadRemote.mockResolvedValue({});
    mocks.getRemote.mockReturnValue(Hello);

    const RemoteHello = createRemoteComponent('remote/Hello', { shadow: false });
    const app = createApp(RemoteHello);
    app.mount(container);
    await flush();

    expect(mocks.loadRemote).toHaveBeenCalledWith('remote/Hello', expect.objectContaining({ shadow: false }));
    expect(container.querySelector('span')?.textContent).toBe('hello');
    app.unmount();
  });

  it('renders nothing before the remote resolves and updates on re-expose', async () => {
    mocks.loadRemote.mockResolvedValue({});
    mocks.getRemote.mockReturnValue(null);
    let updateCb: (() => void) | undefined;
    mocks.subscribeRemoteUpdate.mockImplementation((_entry, cb) => {
      updateCb = cb;
      return () => {};
    });

    const RemoteHello = createRemoteComponent('remote/Hello', { shadow: false });
    const app = createApp(RemoteHello);
    app.mount(container);
    await flush();
    expect(container.querySelector('span')).toBeNull();

    mocks.getRemote.mockReturnValue(Hello);
    updateCb!();
    await flush();
    expect(container.querySelector('span')?.textContent).toBe('hello');
    app.unmount();
  });

  it('logs and renders nothing when loadRemote fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.loadRemote.mockRejectedValue(new Error('boom'));

    const RemoteHello = createRemoteComponent('remote/Hello', { shadow: false });
    const app = createApp(RemoteHello);
    app.mount(container);
    await flush();

    expect(errorSpy).toHaveBeenCalled();
    expect(container.textContent).toBe('');
    app.unmount();
  });
});

describe('LinkjsShadowRoot', () => {
  it('teleports slot content into the shared shadow tree', async () => {
    const Comp = defineComponent({
      components: { LinkjsShadowRoot },
      setup: () => () => h(LinkjsShadowRoot, { name: 'remote-lib' }, { default: () => h('b', { class: 'slotted' }, 'lib') }),
    });

    const app = createApp(Comp);
    app.mount(container);
    await flush();

    const host = Array.from(container.querySelectorAll('div')).find((d) => d.shadowRoot);
    expect(host).toBeTruthy();
    expect(host!.shadowRoot!.querySelector('.slotted')?.textContent).toBe('lib');
    app.unmount();
  });
});
