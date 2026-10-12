/**
 * `import { <Expose> } from '<remote>'` 运行时虚拟模块。
 *
 * 宿主按 `consumeTypes.remotes` 拿到远端 manifest 的 exposes 后，这里把裸 import
 * 说明符解析为虚拟模块 id，并生成对应源码：每个 expose 导出为
 * `createRemoteComponent('<remote>/<Expose>', opts)` 包装的组件。
 */

/** 虚拟模块 id 前缀（`\0` 让打包器按虚拟模块处理，不做文件解析）。 */
export const REMOTE_VIRTUAL_PREFIX = '\0linkjs-remote:';

export interface RemoteImportEntry {
  name: string;
  /** 运行时基址（loadRemote 的 host）。 */
  host: string;
  exposes: string[];
}

export type RemoteImportRegistry = Map<string, RemoteImportEntry>;

export interface RenderRemoteImportOptions {
  /** 生成的远程组件是否启用 Shadow DOM 隔离。 */
  shadow: boolean;
}

const isIdentifier = (name: string) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);

/**
 * 把裸 import 说明符解析为虚拟模块 id：
 * - `<remote>`：导出该远程的全部 expose；
 * - `<remote>/<Expose>`：仅导出单个 expose（存在时）。
 * 未注册或 expose 不存在时返回 `null`（交给其它解析器）。
 */
export function toRemoteImportId(source: string, registry: RemoteImportRegistry): string | null {
  const name = source.split('/')[0];
  const entry = registry.get(name);
  if (!entry) {
    return null;
  }
  if (source === name) {
    return REMOTE_VIRTUAL_PREFIX + name;
  }
  const expose = source.slice(name.length + 1);
  return expose && entry.exposes.includes(expose) ? REMOTE_VIRTUAL_PREFIX + source : null;
}

/** 生成虚拟模块源码；非虚拟 id 或未注册时返回 `null`。 */
export function renderRemoteImport(
  id: string,
  registry: RemoteImportRegistry,
  options: RenderRemoteImportOptions,
): string | null {
  if (!id.startsWith(REMOTE_VIRTUAL_PREFIX)) {
    return null;
  }
  const key = id.slice(REMOTE_VIRTUAL_PREFIX.length);
  const name = key.split('/')[0];
  const expose = key.length > name.length ? key.slice(name.length + 1) : '';
  const entry = registry.get(name);
  if (!entry) {
    return null;
  }

  const opts = JSON.stringify({ host: entry.host, shadow: options.shadow });
  const lines = [`import { createRemoteComponent } from 'linkjs/vue';`];

  if (expose) {
    lines.push(`const component = /* @__PURE__ */ createRemoteComponent(${JSON.stringify(key)}, ${opts});`);
    lines.push(`export default component;`);
    if (isIdentifier(expose)) {
      lines.push(`export { component as ${expose} };`);
    }
    return lines.join('\n');
  }

  const names = entry.exposes.filter(isIdentifier);
  for (const ex of names) {
    lines.push(
      `export const ${ex} = /* @__PURE__ */ createRemoteComponent(${JSON.stringify(`${name}/${ex}`)}, ${opts});`,
    );
  }
  lines.push(`export default { ${names.join(', ')} };`);
  return lines.join('\n');
}
