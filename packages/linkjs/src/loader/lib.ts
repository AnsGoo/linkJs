import { getInstance, loadShare } from '..';
import { LIB_EXPOSE } from '../event-bus/constant';
import { beginStyleCapture, endStyleCapture, ensureShadowTarget } from '../sandbox/shadow';
import { runBeforeLoadRemote, runHook } from '../plugins';
import { recordDiagnostic } from '../devtools';
import { startPhase } from '../perf';
import {
  getRemoteInfo,
  resolveEntryConfig,
  resolvePublicPath,
  resolveShareScopes,
  rewriteRequestUrl,
  useGetRemote,
  useHandleExpose,
  withShareProvider,
  type ExtOption,
  type RemoteCache,
} from './utils';
import type { LoadLibOptions } from './options';

export type { LoadLibOptions } from './options';

export function useLoadRemoteLib<M = unknown>(remoteCache: RemoteCache) {
  return (entry: string, options?: LoadLibOptions) => loadRemoteLib<M>(remoteCache, entry, options);
}

async function loadRemoteLib<M = unknown>(
  remoteCache: RemoteCache,
  entry: string,
  options?: LoadLibOptions,
): Promise<M | null> {
  const [appName, modelName] = entry.split('/');
  const cached = useGetRemote<M>(remoteCache)(entry);
  if (cached) {
    return cached;
  }

  const linkInstance = getInstance();
  const extOption: ExtOption = { modelName };
  const registered = getRemoteInfo(appName);
  const remoteInfo = await runBeforeLoadRemote(registered ? { ...registered } : { name: appName, entry: '' });
  await runHook('afterResolve', remoteInfo);
  await runHook('beforeLoadContainer', remoteInfo);
  const label = remoteInfo.displayName || appName;
  const endTotal = startPhase(`linkjs:load:lib:${appName}`, `加载库「${label}」`);

  const host = await resolvePublicPath(remoteInfo, appName, options?.host);
  const entryName = options?.entryName || resolveEntryConfig(remoteInfo.entry).js;
  const jsUrl = rewriteRequestUrl(entryName ? new URL(entryName, host).href : host, appName);
  const timeout = options?.timeout ?? 10000;

  // Shadow DOM 隔离：在加载库模块前建立游离影子目标并开启样式捕获，
  // 使库模块导入时注入的样式进入影子树（由 LinkjsShadowRoot 挂载时接管）。
  if (options?.shadow) {
    ensureShadowTarget(appName);
    beginStyleCapture(appName);
  }

  // 预加载该远程声明的共享依赖（支持多个共享作用域）
  const shared = remoteInfo.shared || {};
  const shareScopes = resolveShareScopes(remoteInfo);
  await Promise.all(
    Object.keys(shared).flatMap((dep) =>
      shareScopes.map(async (shareScope) => {
        await runHook('beforeLoadShare', dep);
        const start = Date.now();
        const mod = await loadShare(dep, shareScope ? { scope: shareScope } : undefined).catch(() => null);
        await runHook('afterLoadShare', dep, mod, Date.now() - start);
      }),
    ),
  );

  // 加载共享依赖入口文件，注册远程提供的共享依赖。
  // 共享入口是可选产物，缺失或加载失败时不应阻塞主模块加载。
  const sharedEntry = resolveEntryConfig(remoteInfo.entry).shared;
  if (sharedEntry) {
    const sharedUrl = rewriteRequestUrl(new URL(sharedEntry, host).href, appName);
    try {
      await withShareProvider(appName, () => import(/* @vite-ignore */ sharedUrl));
    } catch (error) {
      console.warn(`[linkjs] Failed to load shared entry "${sharedUrl}":`, error);
    }
  }

  await runHook('beforeLoadEntry', remoteInfo);

  return new Promise<M | null>((resolve, reject) => {
    const handleLibExpose = useHandleExpose<M>(remoteCache, resolve, appName, extOption);
    linkInstance.eventBus.on(LIB_EXPOSE, handleLibExpose);

    const fail = (error: unknown) => {
      linkInstance.eventBus.off(LIB_EXPOSE, handleLibExpose);
      if (extOption.timeoutId) {
        clearTimeout(extOption.timeoutId);
      }
      reject(error);
    };

    withShareProvider(appName, () => import(/* @vite-ignore */ jsUrl))
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
      endTotal();
      void runHook('afterLoadContainer', remoteInfo, result);
      void runHook('onLoad', { appName, remoteInfo, module: result });
      void runHook('afterLoadRemote', remoteInfo, result);
      return result;
    },
    (error) => {
      if (options?.shadow) {
        endStyleCapture();
      }
      endTotal();
      recordDiagnostic({
        level: 'error',
        code: 'LOAD_REMOTE_ERROR',
        message: `failed to load remote lib "${appName}": ${String(error)}`,
        context: { appName },
      });
      void runHook('errorLoadRemote', error, remoteInfo);
      throw error;
    },
  );
}
