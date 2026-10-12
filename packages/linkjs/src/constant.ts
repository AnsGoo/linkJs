const __LINKJS_INSTANCE__ = '__linkjs_instance__';

const __LINKJS_OVERRIDES__ = '__linkjs_overrides__';

/**
 * 构建期注入的「远程名 -> 运行时基址」映射（`unplugin-linkjs` 依据 `consumeTypes.remotes`
 * 写入，宿主入口 HTML 的 inline script 提前赋值）。`loadApp/loadLib` 未显式传 `host` 时回退使用。
 */
const __LINKJS_REMOTE_HOSTS__ = '__linkjs_remote_hosts__';

export { __LINKJS_INSTANCE__, __LINKJS_OVERRIDES__, __LINKJS_REMOTE_HOSTS__ };
