import { createUnplugin } from 'unplugin';
import type { Node, ImportDeclaration } from 'oxc-parser';
import MagicString from 'magic-string';

import { buildSharedFile } from './build-shared';
import type { ManifestJson, UnpluginLinkjsOptions } from './types';
import { generateManifestFile, updateManifestFile } from './build-manifest';
import { resolve } from 'dns';
import path from 'path';

export type { ManifestJson, UnpluginLinkjsOptions };

export const unpluginLinkjs = createUnplugin((options: UnpluginLinkjsOptions = {}) => {
  const { extensions = ['.js', '.jsx', '.ts', '.tsx', '.vue'], shared = {}, isReplaceLinkjs = true } = options;
  const sharedPkgs = Object.keys(shared);
  const entry: Record<string, string> = {};
  return {
    name: 'unplugin-linkjs',
    enforce: 'post',

    rolldown: {
      buildEnd() {
        console.log('buildEnd');
        const moduleIds = this.getModuleIds();
        const exposes: string[] = [];
        for (const moduleId of moduleIds) {
          const module = this.getModuleInfo(moduleId);
          if (module?.isEntry && !moduleId.endsWith('.d.ts')) {
            exposes.push(...(module.exports || []));
          }
        }
        const outDir = (this as any).outputOptions?.dir;
        generateManifestFile(outDir, exposes, shared);
        if (Object.keys(shared).length > 0) {
          buildSharedFile(shared, outDir);
        }
      },
      transform(code: string, id: string, meta: any) {
        if (id.includes('css')) {
          return null;
        }

        const isSupportedFile = extensions.some((ext) => id.endsWith(ext));

        if (!isSupportedFile) {
          return null;
        }

        const packagesInCode = sharedPkgs.filter((pkg) => new RegExp(`from\\s+['"]${pkg}['"]`).test(code));
        const hasLinkjsImport = new RegExp(`from\\s+['"]linkjs['"]`).test(code);

        if (packagesInCode.length === 0 && !hasLinkjsImport) {
          return null;
        }

        const ast = this.parse(code, {
          sourceType: 'module',
        });

        const magicString = new MagicString(code);
        let hasModifications = false;

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

        const walk = (node: Node) => {
          if (node.type === 'ImportDeclaration') {
            transformImportDeclaration(node);
          }

          if ('body' in node && Array.isArray(node.body)) {
            node.body.forEach(walk);
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
      generateBundle(options, bundle) {
        const bundleKeys = Object.keys(bundle);
        const outDir = (this as any).outputOptions?.dir;
        const baseDir = outDir.replace(process.cwd(), '');
        bundleKeys.forEach((key) => {
          const bundleItem = bundle[key];
          if (bundleItem.type === 'chunk' && bundleItem.isEntry) {
            entry[key.endsWith('.d.ts') ? 'types' : 'js'] = path.join(baseDir, key);
          } else if (bundleItem.type === 'asset') {
            entry['css'] = path.join(baseDir, key);
          }
        });

        updateManifestFile(outDir, { entry });
      },
    },
  };
});

const unpluginLinkjsRollowPlugin = unpluginLinkjs.rolldown;
export { unpluginLinkjsRollowPlugin };
export default unpluginLinkjs;
