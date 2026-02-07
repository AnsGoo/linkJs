export default function injectRemoteScript() {
  return {
    name: 'inject-remote-script',
    transformIndexHtml(html) {
      // 不需要删除原有的脚本标签，也不需要注入新的脚本标签
      // 直接返回原有的 HTML 即可
      return html;
    },
  };
}
