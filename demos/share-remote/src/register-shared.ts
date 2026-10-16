import { getInstance, registerShare } from 'linkjs';
import * as kit from './kit/v2';

/**
 * 把远端自带的 `linkkit@2.0.0` 注册进（宿主的）共享注册表。
 *
 * 这是本演示的关键：远端作为**另一个提供方**，把不同版本的共享库注入宿主运行时，
 * 于是 `linkkit` 在宿主侧同时存在 v1.0.0（宿主）与 v2.0.0（本远端），
 * 后续 `loadShare`/`getShare` 才会发生「版本协商」。
 */
export function registerSharedKit(): void {
  const scope = getInstance().shares.get('global');
  const already = scope?.get('linkkit')?.some((info) => info.provider === 'shareRemote');
  if (already) {
    return;
  }
  registerShare({
    linkkit: {
      name: 'linkkit',
      version: kit.version,
      scope: 'global',
      provider: 'shareRemote',
      lib: () => kit,
    },
  });
}
