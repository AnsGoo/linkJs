import { createUnplugin } from 'unplugin';
import type { Node, ImportDeclaration } from 'oxc-parser';
import MagicString from 'magic-string';

import type { ManifestJson, UnpluginLinkjsOptions } from './types';
import { generateManifestFile, updateManifestFile } from './build-manifest';
import path from 'path';

export type { ManifestJson, UnpluginLinkjsOptions };

export const unpluginLinkjs = createUnplugin((options: UnpluginLinkjsOptions = {}) => {
  const { extensions = ['.js', '.jsx', '.ts', '.tsx', '.vue', '.d.ts','.mjs','.cjs'], shared = {}, isReplaceLinkjs = true } = options;
  const sharedPkgs = Object.keys(shared);
  const entry: Record<string, string> = {};
  return {
    name: 'unplugin-linkjs',
    enforce: 'post',

    rolldown: {
      buildEnd() {},
      async writeBundle(options, bundle) {
        const moduleIds = this.getModuleIds();
        const exposes: string[] = [];
        for (const moduleId of moduleIds) {
          const module = this.getModuleInfo(moduleId);
          if (module?.isEntry && !moduleId.endsWith('.d.ts')) {
            exposes.push(...(module.exports || []));
          }
        }

        const bundleKeys = Object.keys(bundle);
        const outDir = (this as any).outputOptions?.dir || 'dist';
        const baseDir = outDir.replace(process.cwd(), '');

        generateManifestFile(outDir, exposes, shared);

        bundleKeys.forEach((key) => {
          const bundleItem = bundle[key];
          if (bundleItem.type === 'chunk' && bundleItem.isEntry) {
            entry[key.endsWith('.d.ts') ? 'types' : 'js'] = path.join(baseDir, key);
          } else if (bundleItem.type === 'asset') {
            entry[key.endsWith('.css') ? 'css' : 'html'] = path.join(baseDir, key);
          }
        });

        updateManifestFile(outDir, { entry });
      },
      transform(code: string, id: string, meta: any) {
        if (id.includes('css')) {
          return null;
        }

        // 移除文件类型检查，处理所有文件，包括外部依赖
        const isSupportedFile = extensions.some((ext) => id.endsWith(ext));
        if (!isSupportedFile) {
          return null;
        }

        // 检查是否包含共享包或linkjs的导入
        const packagesInCode = sharedPkgs.filter((pkg) => new RegExp(`from\\s+['"]${pkg}['"]`).test(code));
        const hasLinkjsImport = new RegExp(`from\\s+['"]linkjs['"]`).test(code);

        if (packagesInCode.length === 0 && !hasLinkjsImport) {
          return null;
        }

        // 解析AST
        const ast = this.parse(code, {
          sourceType: 'module',
        });

        const magicString = new MagicString(code);
        let hasModifications = false;

        // 转换导入声明
        const transformImportDeclaration = (node: ImportDeclaration) => {
          const source = node.source.value;

          const isLinkjs = source === 'linkjs' && isReplaceLinkjs;
          const isSharedPkg = sharedPkgs.includes(source);

          if (!isLinkjs && !isSharedPkg) {
            return;
          }

          if (node.specifiers.length === 0) {
            return;
          }

          const importSpecifiers = node.specifiers
            .filter((spec): spec is Extract<typeof spec, { type: 'ImportSpecifier' }> => spec.type === 'ImportSpecifier')
            .map((spec) => {
              const imported = spec.imported.type === 'Identifier' ? spec.imported.name : spec.imported.value;
              const local = spec.local.name;
              return imported === local ? local : `${imported}: ${local}`;
            })
            .join(', ');

          if (!importSpecifiers) {
            return;
          }

          const newCode = isLinkjs
            ? `const { ${importSpecifiers} } = $linkjs;`
            : `const { ${importSpecifiers} } = $linkjs.getShare('${source}');`;

          magicString.overwrite(node.start, node.end, newCode);
          hasModifications = true;
        };

        // 遍历AST
        const walk = (node: Node) => {
          // 确保节点是一个对象
          if (!node || typeof node !== 'object') {
            return;
          }

          if (node.type === 'ImportDeclaration') {
            transformImportDeclaration(node);
          }

          // 递归遍历所有子节点
          if ('body' in node && Array.isArray(node.body)) {
            node.body.forEach(walk);
          }
          // 处理其他可能包含导入的节点类型
          if ('expression' in node) {
            walk(node.expression);
          }
          if ('declarations' in node) {
            node.declarations.forEach(walk);
          }
        };

        walk(ast);

        if (!hasModifications) {
          return null;
        }

        return {
          code: magicString.toString(),
          map: magicString.generateMap({ hires: true }),
        };
      },
      options(options: any) {
        options['experimental'] = { nativeMagicString: true };
        return options;
      },
    },
  };
});

const unpluginLinkjsRollowPlugin = unpluginLinkjs.rolldown;
export { unpluginLinkjsRollowPlugin };
export default unpluginLinkjs;
