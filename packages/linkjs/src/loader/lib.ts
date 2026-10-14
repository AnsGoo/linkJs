import { getInstance } from '..';
import { LIB_EXPOSE } from '../event-bus/constant';
import { beginStyleCapture, endStyleCapture, ensureShadowTarget, isShadowSupported } from '../sandbox/shadow';
import { runBeforeLoadRemote, runHook } from '../plugins';
import { recordDiagnostic } from '../devtools';
import { startPhase } from '../perf';
import {
  getRemoteInfo,
  loadCss,
  resolveEntryConfig,
  resolvePublicPath,
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

  // Shadow DOM 隔离（默认开启；运行环境不支持 Shadow 时自动降级为非隔离）。
  const useShadow = Boolean(options?.shadow) && isShadowSupported();
  if (useShadow) {
    ensureShadowTarget(appName);
    beginStyleCapture(appName);
  }

  // 加载远程库的样式（`entry.css`）。shadow 模式下经 `loadCss(url, appName)` 注入影子树，否则注入 head。
  // 不阻塞：样式可能被路由到一个**尚未挂载（游离）**的影子树，此时 <link> 不会触发 onload，
  // `await` 会永久挂起；交由浏览器异步加载即可（与 `loadApp` 的 CSS 处理一致）。
  const cssEntry = resolveEntryConfig(remoteInfo.entry).css;
  if (cssEntry) {
    const cssUrl = rewriteRequestUrl(new URL(cssEntry, host).href, appName);
    void loadCss(cssUrl, appName);
  }

  // 按需加载：默认**不**预加载共享依赖（由远端 import 时 `await loadShare` 触发）。

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
      if (useShadow) {
        endStyleCapture(appName);
      }
      endTotal();
      void runHook('afterLoadContainer', remoteInfo, result);
      void runHook('onLoad', { appName, remoteInfo, module: result });
      void runHook('afterLoadRemote', remoteInfo, result);
      return result;
    },
    (error) => {
      if (useShadow) {
        endStyleCapture(appName);
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
