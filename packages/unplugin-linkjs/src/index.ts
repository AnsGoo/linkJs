import { createUnplugin } from 'unplugin';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { parseSync } from 'oxc-parser';
import type { Node, ImportDeclaration, ParseResult } from 'oxc-parser';
import MagicString from 'magic-string';

import type { ManifestJson, UnpluginLinkjsOptions } from './types';
import { isRegExp } from 'util/types';

function isExternal(finalExternal: any[], dependenceName: string): boolean {
  for (const item of finalExternal) {
    if (typeof item === 'string') {
      return item === dependenceName;
    }

    if (isRegExp(item)) {
      return item.test(dependenceName);
    }
    if (typeof item === 'function') {
      return item(dependenceName);
    }
  }
  return false;
}

export const unpluginLinkjs = createUnplugin((options: UnpluginLinkjsOptions = {}) => {
  const { customFields = {}, shared = {} } = options;

  let external: string[] = [];
  const sharedPkgs = Object.keys(shared);

  return {
    name: 'unplugin-linkjs',
    enforce: 'post',

    buildEnd() {
      const packageJsonPath = resolve(process.cwd(), 'package.json');
      const outDir = this.outputOptions.dir;
      if (!existsSync(packageJsonPath)) {
        console.warn('package.json not found in current working directory');
        return;
      }

      try {
        const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonContent);

        const manifest: ManifestJson = {
          name: packageJson.name || '',
          version: packageJson.version || '',
          types: packageJson.types || packageJson.typings,
          exports: packageJson.exports,
        };

        const externalDeps: Record<string, string> = {};

        let finalExternal: string[] = [...sharedPkgs];

        if (finalExternal.length > 0) {
          const allDeps: Record<string, string> = {};

          if (packageJson.dependencies) {
            Object.assign(allDeps, packageJson.dependencies);
          }

          if (packageJson.peerDependencies) {
            Object.assign(allDeps, packageJson.peerDependencies);
          }
          finalExternal.forEach((dep) => {
            if (allDeps[dep]) {
              externalDeps[dep] = allDeps[dep];
            }
          });

          const deps = Object.keys(allDeps);
          deps.forEach((dep) => {
            if (isExternal(finalExternal, dep)) {
              externalDeps[dep] = allDeps[dep];
            }
          });
        }

        if (Object.keys(externalDeps).length > 0) {
          manifest.dependencies = externalDeps;
        }

        if (packageJson.files) {
          manifest.files = packageJson.files;
        }

        Object.assign(manifest, customFields);
        const outputPath = resolve(outDir, 'manifest.json');
        const outputDir = dirname(outputPath);

        if (!existsSync(outputDir)) {
          mkdirSync(outputDir, { recursive: true });
        }
        console.log(outputPath);
        writeFileSync(outputPath, JSON.stringify(manifest, null, 2), 'utf-8');
      } catch (error) {
        console.error(`Failed to generate manifest.json: ${error}`);
        throw error;
      }
    },
    rolldown: {
      transform(code: string, id: string, meta: any) {
        if (id.includes('css')) {
          return null;
        }
        console.log(meta);

        const supportedExtensions = ['.js', '.jsx', '.ts', '.tsx', '.vue'];

        const isSupportedFile = supportedExtensions.some((ext) => id.endsWith(ext));

        if (!isSupportedFile) {
          return null;
        }

        const packagesInCode = sharedPkgs.filter((pkg) => new RegExp(`from\\s+['"]${pkg}['"]`).test(code));
        const hasLinkjsImport = new RegExp(`from\\s+['"]linkjs['"]`).test(code);

        if (packagesInCode.length === 0 && !hasLinkjsImport) {
          return null;
        }

        const ast: ParseResult = parseSync(id, code, {
          sourceType: 'module',
        });

        const magicString = new MagicString(code);
        let hasModifications = false;

        const transformImportDeclaration = (node: ImportDeclaration) => {
          const source = node.source.value;

          const isLinkjs = source === 'linkjs';
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

        walk(ast.program);

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
      renderStart(_outputOptions, _inputOptions) {
        // console.log('renderStart context', this);
        // console.log('renderStart outputOptions', outputOptions);
        // console.log('renderStart inputOptions', inputOptions);
      },
    },
  };
});

const unpluginLinkjsRollowPlugin = unpluginLinkjs.rolldown;
export { unpluginLinkjsRollowPlugin };
export default unpluginLinkjs;
