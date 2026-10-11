import type { RuntimePlugin } from './index';

/**
 * Auth（鉴权注入）运行时插件。
 *
 * 通过 `apply(instance)` 注册一个**请求 URL 重写器**，对本远程加载涉及的所有资源
 * （入口 HTML、脚本、样式、modulepreload、库入口）统一追加鉴权参数；token 可在
 * `beforeLoadRemote` 阶段异步解析（如取接口/刷新令牌）后缓存。
 *
 * ```ts
 * createInstance({
 *   plugin: authPlugin({
 *     tokens: { remote: () => fetchToken() },
 *     queryParam: 'access_token',
 *   }),
 * });
 * ```
 *
 * 注意：`<script>`/`<link>` 无法设置请求头，故采用 query 参数；子模块的**嵌套动态 import**
 * 由浏览器相对解析、不经此重写器，通常需服务端在首个请求后下发会话 Cookie 才能覆盖。
 */
export interface AuthPluginOptions {
  /** 全局 token（所有远程通用）。 */
  token?: string | ((info: { name: string }) => string | Promise<string>);
  /** 按远程名配置的 token（优先于全局）。 */
  tokens?: Record<string, string | ((info: { name: string }) => string | Promise<string>)>;
  /** 鉴权参数名，默认 `token`。 */
  queryParam?: string;
  /** 仅对匹配的 URL 生效（如限定 CDN 域名前缀）。 */
  origins?: string[];
  /** 自定义是否需要重写。 */
  applyTo?: (url: string, name?: string) => boolean;
}

type RequestRewriter = (url: string, ctx: { remoteName?: string }) => string | void;

export function authPlugin(options: AuthPluginOptions = {}): RuntimePlugin {
  const queryParam = options.queryParam ?? 'token';
  const cache = new Map<string, string>();

  const resolveToken = async (name: string): Promise<string | undefined> => {
    const provider = options.tokens?.[name] ?? options.token;
    if (provider == null) {
      return undefined;
    }
    const value = typeof provider === 'function' ? await provider({ name }) : provider;
    return value || undefined;
  };

  const rewriter: RequestRewriter = (url, ctx) => {
    const name = ctx.remoteName;
    if (!name) {
      return;
    }
    const token = cache.get(name);
    if (!token) {
      return;
    }
    if (options.origins && !options.origins.some((origin) => url.startsWith(origin))) {
      return;
    }
    if (options.applyTo && !options.applyTo(url, name)) {
      return;
    }
    try {
      const target = new URL(url, typeof location !== 'undefined' ? location.href : undefined);
      target.searchParams.set(queryParam, token);
      return target.href;
    } catch {
      return;
    }
  };

  return {
    name: 'linkjs-auth',
    apply(instance) {
      const host = instance as { requestRewriters?: RequestRewriter[] };
      (host.requestRewriters ??= []).push(rewriter);
    },
    async beforeLoadRemote(remoteInfo) {
      const name = (remoteInfo as { name?: string })?.name;
      if (!name) {
        return remoteInfo;
      }
      const token = await resolveToken(name);
      if (token) {
        cache.set(name, token);
      }
      return remoteInfo;
    },
  };
}
