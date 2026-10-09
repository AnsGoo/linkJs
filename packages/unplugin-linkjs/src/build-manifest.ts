import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { createRequire } from 'module';
import { isRegExp } from 'util/types';
import { ManifestJson } from './types';

const require = createRequire(import.meta.url);

/**
 * 解析共享依赖的版本号。
 * `workspace:*` / `workspace:^` 等协议会读取对应工作区包 package.json 的 version，
 * 而不是写死 `1.0.0`。
 */
function resolveDependencyVersion(pkgName: string, declared: string | undefined): string {
  if (!declared) {
    return '1.0.0';
  }
  if (declared.startsWith('workspace:')) {
    try {
      const pkgJsonPath = require.resolve(`${pkgName}/package.json`, { paths: [process.cwd()] });
      const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf-8'));
      return pkgJson.version || '0.0.0';
    } catch {
      // 工作区包未安装/无法解析时退回一个中性版本
      return '0.0.0';
    }
  }
  return declared;
}

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

function generateManifestFile(outDir: string, exposes: string[], shared: Record<string, any>, sharedDeps: Record<string, string[]> = {}) {
  const packageJsonPath = resolve(process.cwd(), 'package.json');

  if (!existsSync(packageJsonPath)) {
    console.warn('package.json not found in current working directory');
    return;
  }

  try {
    const packageJsonContent = readFileSync(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);

    const externalDeps: Record<string, string> = {};
    const sharedPkgs = Object.keys(shared);

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

    const outputPath = resolve(outDir, 'manifest.json');
    const outputDir = dirname(outputPath);

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const manifest: ManifestJson = {
      name: packageJson.name || '',
      version: packageJson.version || '',
      description: packageJson.description || '',
      entry: {},
      expose: [...new Set(exposes)],
      shared: {},
    };

    for (const [depName, depConfig] of Object.entries(shared)) {
      const declared = externalDeps[depName] || packageJson.dependencies?.[depName] || packageJson.peerDependencies?.[depName];
      manifest.shared![depName] = {
        version: resolveDependencyVersion(depName, declared),
        scope: depConfig.scope || 'global',
        singleton: depConfig.singleton ?? true,
        dependencies: sharedDeps[depName] || depConfig.dependencies || [],
      };
    }
    writeFileSync(outputPath, JSON.stringify(manifest, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Failed to generate manifest.json: ${error}`);
    throw error;
  }
}

function updateManifestFile(outDir: string, content?: Partial<Pick<ManifestJson, 'expose' | 'entry' | 'dependencies'>>, sharedDeps: Record<string, string[]> = {}) {
  const manifestJsonPath = resolve(outDir, 'manifest.json');

  if (!existsSync(manifestJsonPath)) {
    console.warn('manifest.json not found in current working directory');
    return;
  }

  try {
    const manifestJsonContent = readFileSync(manifestJsonPath, 'utf-8');
    const manifestJson = JSON.parse(manifestJsonContent);

    const { expose = [], entry = {}, dependencies = [] } = content || {};
    manifestJson.expose = Array.from(new Set([...expose, ...(manifestJson.expose || [])]));
    manifestJson.entry = { ...(manifestJson.entry || {}), ...entry };
    manifestJson.dependencies = dependencies;

    // 更新 shared 依赖的 dependencies 字段
    if (Object.keys(sharedDeps).length > 0) {
      manifestJson.shared = manifestJson.shared || {};
      Object.keys(sharedDeps).forEach(depName => {
        if (manifestJson.shared[depName]) {
          manifestJson.shared[depName].dependencies = sharedDeps[depName] || [];
        }
      });
    }

    writeFileSync(manifestJsonPath, JSON.stringify(manifestJson, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Failed to update manifest.json: ${error}`);
    throw error;
  }
}
export { generateManifestFile, updateManifestFile };
