import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { isRegExp } from 'util/types';
import { ManifestJson } from './types';

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

function generateManifestFile(outDir: string, exposes: string[], shared: Record<string, any>) {
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
      const version = externalDeps[depName] || packageJson.dependencies?.[depName] || packageJson.peerDependencies?.[depName] || '1.0.0';
      manifest.shared![depName] = {
        version: version === 'workspace:*' ? '1.0.0' : version,
        scope: depConfig.scope || 'global',
        singleton: depConfig.singleton ?? true,
      };
    }

    writeFileSync(outputPath, JSON.stringify(manifest, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Failed to generate manifest.json: ${error}`);
    throw error;
  }
}

function updateManifestFile(outDir: string, content?: Partial<Pick<ManifestJson, 'expose' | 'entry'>>) {
  const manifestJsonPath = resolve(outDir, 'manifest.json');

  if (!existsSync(manifestJsonPath)) {
    console.warn('manifest.json not found in current working directory');
    return;
  }

  try {
    const manifestJsonContent = readFileSync(manifestJsonPath, 'utf-8');
    const manifestJson = JSON.parse(manifestJsonContent);

    const { expose = [], entry = {} } = content || {};
    manifestJson.expose = Array.from(new Set([...expose, ...(manifestJson.expose || [])]));
    manifestJson.entry = { ...(manifestJson.entry || {}), ...entry };

    writeFileSync(manifestJsonPath, JSON.stringify(manifestJson, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Failed to update manifest.json: ${error}`);
    throw error;
  }
}
export { generateManifestFile, updateManifestFile };
