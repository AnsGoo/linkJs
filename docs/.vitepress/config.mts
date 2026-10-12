import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'LinkJS',
  description: '微前端运行时：远程加载、共享依赖、Shadow 隔离、类型转发',
  lang: 'zh-CN',
  cleanUrls: true,
  // 仓库内的深度设计文档暂不纳入站点（内容/格式待整理，见 backlog H1）。
  srcExclude: [
    'backlog.md',
    'development-plan.md',
    'hmr-design.md',
    'hmr-implementation.md',
    'dts-type-forwarding.md',
    'observability.md',
    'remote-dependencies.md',
  ],
  themeConfig: {
    nav: [
      { text: '指南', link: '/guide/getting-started' },
      { text: 'API', link: '/api/' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '开始',
          items: [
            { text: '快速开始', link: '/guide/getting-started' },
            { text: '集成模式', link: '/guide/integration-modes' },
          ],
        },
      ],
      '/api/': [{ text: 'API 参考', items: [{ text: '概览', link: '/api/' }] }],
    },
    socialLinks: [{ icon: 'github', link: 'https://github.com/AnsGoo/linkJs' }],
    outline: { label: '本页目录' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    darkModeSwitchLabel: '主题',
    returnToTopLabel: '回到顶部',
  },
});
