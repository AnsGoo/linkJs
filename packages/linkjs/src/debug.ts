/**
 * 内部调试日志：核心运行时默认**静默**，避免污染宿主控制台。
 *
 * 需要排查加载/缓存行为时，在宿主入口设置 `globalThis.__LINKJS_DEBUG__ = true` 即可开启。
 * 面向使用方的加载指标请用 logger 插件（`getLoadMetrics()`），不要依赖本模块。
 */
function isDebugEnabled(): boolean {
  return (globalThis as { __LINKJS_DEBUG__?: unknown }).__LINKJS_DEBUG__ === true;
}

function debugLog(...args: unknown[]): void {
  if (!isDebugEnabled()) {
    return;
  }
  console.log('[linkjs]', ...args);
}

export { debugLog, isDebugEnabled };
