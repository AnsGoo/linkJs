import { createUnplugin } from 'unplugin';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

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
  const { customFields = {} } = options;

  let external: string[] = [];

  return {
    name: 'unplugin-linkjs',
    enforce: 'post',

    buildEnd() {
      const outDir = this.outputOptions.dir;
      const packageJsonPath = resolve(process.cwd(), 'package.json');

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

        // 再次尝试获取 external 配置，确保能获取到最新的配置
        let finalExternal: string[] = [...external];

        // 只包含被 external 排除的依赖
        if (finalExternal.length > 0) {
          const allDeps: Record<string, string> = {};

          if (packageJson.dependencies) {
            Object.assign(allDeps, packageJson.dependencies);
          }

          if (packageJson.peerDependencies) {
            Object.assign(allDeps, packageJson.peerDependencies);
          }

          // 过滤出在 external 中的依赖
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

        writeFileSync(outputPath, JSON.stringify(manifest, null, 2), 'utf-8');
      } catch (error) {
        console.error(`Failed to generate manifest.json: ${error}`);
        throw error;
      }
    },
    rolldown: {
      options(options: any) {
        external.push(...(options.external || []));
        return options;
      },
    },
  };
});

const rolldownPlugin = unpluginLinkjs.rolldown;
export { rolldownPlugin };
export default unpluginLinkjs;
