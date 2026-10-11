// 在“被检查页面”的上下文里读取 LinkJS 快照并渲染。
// 依赖页面已加载 linkjs（其会暴露全局 __LINKJS__）。

const out = document.getElementById('out');
const status = document.getElementById('status');

const EVAL_EXPR = `(() => {
  if (!window.__LINKJS__) return null;
  try { return JSON.stringify(window.__LINKJS__.getSnapshot(), null, 2); } catch (e) { return 'ERR:' + e.message; }
})()`;

function refresh() {
  chrome.devtools.inspectedWindow.eval(EVAL_EXPR, (result, exceptionInfo) => {
    if (exceptionInfo) {
      status.textContent = 'eval error';
      out.textContent = exceptionInfo.value || String(exceptionInfo);
      return;
    }
    if (result === null) {
      status.textContent = '未检测到 linkjs（window.__LINKJS__ 不存在）';
      out.textContent = '';
      return;
    }
    if (typeof result === 'string' && result.startsWith('ERR:')) {
      status.textContent = '读取失败';
      out.textContent = result;
      return;
    }
    status.textContent = '已连接';
    out.textContent = result;
  });
}

document.getElementById('refresh').addEventListener('click', refresh);
refresh();
setInterval(refresh, 1000);
