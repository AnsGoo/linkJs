import type { RemoteSnapshot } from './types';

export function ms(value: number): string {
  const n = Number(value) || 0;
  return n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${Math.round(n)}ms`;
}

export function kindLabel(kind: string): string {
  return kind === 'lib' ? '库' : kind === 'remote' ? '远程' : '应用';
}

export function timeStr(time: number): string {
  try {
    return new Date(time).toLocaleTimeString();
  } catch {
    return '';
  }
}

/** 注册名 -> 展示名（manifest name）。 */
export function displayMap(remotes: RemoteSnapshot[] | undefined): Map<string, string> {
  return new Map((remotes || []).map((r) => [r.name, r.displayName || r.name]));
}

export function prettyEntry(entry: string, map: Map<string, string>): string {
  const parts = String(entry).split('/');
  parts[0] = map.get(parts[0]) || parts[0];
  return parts.join('/');
}

/** 性能标签按当前 displayName 动态生成。 */
export function perfLabel(name: string, map: Map<string, string>): string {
  if (name.startsWith('linkjs:load:app:')) {
    const [app, ...phaseParts] = name.slice('linkjs:load:app:'.length).split(':');
    const dn = map.get(app) || app;
    const phase = phaseParts.join(':');
    if (phase === 'fetch') return `拉取入口 HTML「${dn}」`;
    if (phase === 'scripts') return `加载远程脚本「${dn}」`;
    return `加载应用「${dn}」`;
  }
  if (name.startsWith('linkjs:load:lib:')) {
    const app = name.slice('linkjs:load:lib:'.length);
    return `加载库「${map.get(app) || app}」`;
  }
  if (name.startsWith('linkjs:share:')) {
    return `加载共享依赖「${name.slice('linkjs:share:'.length)}」`;
  }
  return name;
}

export function remoteLabel(r: RemoteSnapshot): string {
  return `${r.displayName || r.name}${r.displayName && r.displayName !== r.name ? ` (${r.name})` : ''}${r.type ? ` · ${r.type}` : ''}`;
}
