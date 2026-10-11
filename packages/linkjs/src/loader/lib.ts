import { getInstance, loadShare } from '..';
import { LIB_EXPOSE } from '../event-bus/constant';
import { beginStyleCapture, endStyleCapture, ensureShadowTarget } from '../sandbox/shadow';
import { runBeforeLoadRemote, runHook } from '../plugins';
import { getRemoteInfo, useGetRemote, useHandleExpose, type ExtOption } from './utils';

export interface LoadLibOptions {
  host?: string;
  entryName?: string;
  timeout?: number;
  /** 是否启用 Shadow DOM 样式隔离（配合 `linkjs/vue` 的 `LinkjsShadowRoot` 使用）。 */
  shadow?: boolean;
}

export function useLoadRemoteLib<Module>(remoteCache: Map<string, Record<string, Module> | Module>) {
  return (entry: string, options?: LoadLibOptions) => loadRemoteLib(remoteCache, entry, options);
}

async function loadRemoteLib<Module>(
  remoteCache: Map<string, Record<string, Module> | Module>,
  entry: string,
  options?: LoadLibOptions,
): Promise<Module | null> {
  const [appName, modelName] = entry.split('/');
  const cached = useGetRemote(remoteCache)(entry);
  if (cached) {
    return cached as Module;
  }

  const linkInstance = getInstance();
  const extOption: ExtOption = { modelName };
  const remoteInfo = (await runBeforeLoadRemote({ ...(getRemoteInfo(appName) as any) })) as any;
  await runHook('afterResolve', remoteInfo);
  await runHook('beforeLoadContainer', remoteInfo);

  const host = options?.host || remoteInfo?.host || `${location.protocol}//${location.host}`;
  const entryName = options?.entryName || remoteInfo?.entry?.js;
  const jsUrl = `${host}${entryName}`;
  const timeout = options?.timeout ?? 10000;

  // Shadow DOM 隔离：在加载库模块前建立游离影子目标并开启样式捕获，
  // 使库模块导入时注入的样式进入影子树（由 LinkjsShadowRoot 挂载时接管）。
  if (options?.shadow) {
    ensureShadowTarget(appName);
    beginStyleCapture(appName);
  }

  // 预加载该远程声明的共享依赖（支持多个共享作用域）
  const shared = remoteInfo?.shared || {};
  const shareScopes: (string | undefined)[] = remoteInfo?.shareScope?.length ? remoteInfo.shareScope : [undefined];
  await Promise.all(
    Object.keys(shared).flatMap((dep) =>
      shareScopes.map(async (shareScope) => {
        await runHook('beforeLoadShare', dep);
        const mod = await loadShare(dep, shareScope ? { scope: shareScope } : undefined).catch(() => null);
        await runHook('afterLoadShare', dep, mod);
      }),
    ),
  );

  // 加载共享依赖入口文件，注册远程提供的共享依赖。
  // 共享入口是可选产物，缺失或加载失败时不应阻塞主模块加载。
  const sharedEntry = remoteInfo?.entry?.shared;
  if (sharedEntry) {
    const sharedUrl = `${host}${sharedEntry}`;
    try {
      await import(/* @vite-ignore */ sharedUrl);
    } catch (error) {
      console.warn(`[linkjs] Failed to load shared entry "${sharedUrl}":`, error);
    }
  }

  await runHook('beforeLoadEntry', remoteInfo);

  return new Promise<Module | null>((resolve, reject) => {
    const handleLibExpose = useHandleExpose(remoteCache, resolve, appName, extOption);
    linkInstance.eventBus.on(LIB_EXPOSE, handleLibExpose);

    const fail = (error: unknown) => {
      linkInstance.eventBus.off(LIB_EXPOSE, handleLibExpose);
      if (extOption.timeoutId) {
        clearTimeout(extOption.timeoutId);
      }
      reject(error);
    };

    import(/* @vite-ignore */ jsUrl)
      .then(async () => {
        await runHook('afterLoadEntry', remoteInfo);
        extOption.timeoutId = setTimeout(() => {
          fail(new Error(`Timeout waiting for module ${appName} to expose`));
        }, timeout);
      })
      .catch(fail);
  }).then(
    (result) => {
      if (options?.shadow) {
        endStyleCapture();
      }
      void runHook('afterLoadContainer', remoteInfo, result);
      void runHook('onLoad', { appName, remoteInfo, module: result });
      void runHook('afterLoadRemote', remoteInfo, result);
      return result;
    },
    (error) => {
      if (options?.shadow) {
        endStyleCapture();
      }
      void runHook('errorLoadRemote', error, remoteInfo);
      throw error;
    },
  );
}
