import { describe, expect, it } from 'vitest';
import {
  REMOTE_VIRTUAL_PREFIX,
  renderRemoteImport,
  toRemoteImportId,
  type RemoteImportRegistry,
} from '../src/remote-imports';

function registry(): RemoteImportRegistry {
  return new Map([
    ['remoteApp', { name: 'remoteApp', host: 'http://localhost:8081', exposes: ['HelloWorld', 'Counter'] }],
  ]);
}

describe('toRemoteImportId', () => {
  it('resolves a bare remote name', () => {
    expect(toRemoteImportId('remoteApp', registry())).toBe(`${REMOTE_VIRTUAL_PREFIX}remoteApp`);
  });

  it('resolves a remote subpath to a known expose', () => {
    expect(toRemoteImportId('remoteApp/HelloWorld', registry())).toBe(`${REMOTE_VIRTUAL_PREFIX}remoteApp/HelloWorld`);
  });

  it('ignores unknown remotes and unknown exposes', () => {
    expect(toRemoteImportId('vue', registry())).toBeNull();
    expect(toRemoteImportId('remoteApp/Nope', registry())).toBeNull();
  });
});

describe('renderRemoteImport', () => {
  it('emits a named export per expose for the bare remote module', () => {
    const code = renderRemoteImport(`${REMOTE_VIRTUAL_PREFIX}remoteApp`, registry(), { shadow: true });
    expect(code).toContain("import { createRemoteComponent } from 'linkjs/vue';");
    expect(code).toContain('export const HelloWorld = /* @__PURE__ */ createRemoteComponent("remoteApp/HelloWorld"');
    expect(code).toContain('export const Counter = /* @__PURE__ */ createRemoteComponent("remoteApp/Counter"');
    expect(code).toContain('"host":"http://localhost:8081"');
    expect(code).toContain('"shadow":true');
    expect(code).toContain('export default { HelloWorld, Counter };');
  });

  it('emits default + named for a single expose subpath', () => {
    const code = renderRemoteImport(`${REMOTE_VIRTUAL_PREFIX}remoteApp/HelloWorld`, registry(), { shadow: false });
    expect(code).toContain('const component = /* @__PURE__ */ createRemoteComponent("remoteApp/HelloWorld"');
    expect(code).toContain('export default component;');
    expect(code).toContain('export { component as HelloWorld };');
    expect(code).toContain('"shadow":false');
  });

  it('returns null for non-virtual ids or unregistered remotes', () => {
    expect(renderRemoteImport('remoteApp', registry(), { shadow: false })).toBeNull();
    expect(renderRemoteImport(`${REMOTE_VIRTUAL_PREFIX}unknown`, registry(), { shadow: false })).toBeNull();
  });
});
