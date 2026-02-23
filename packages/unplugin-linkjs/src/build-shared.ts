import { build } from 'rolldown';
import { updateManifestFile } from './build-manifest';
import path from 'path';

export async function generateSharedFileContent(sharedConfig: Record<string, any>): Promise<string> {
  const imports: string[] = [];
  const exports: string[] = [];

  for (const [pkgName, pkgConfig] of Object.entries(sharedConfig)) {
    const parts = pkgName.split('-');
    const importName = parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('');

    if (typeof pkgConfig.lib === 'function') {
      imports.push(`const ${importName} = () => import('${pkgName}');`);
    } else {
      imports.push(`import * as ${importName} from '${pkgName}';`);
    }
    exports.push(`  ${importName},`);
  }

  const entryContent = `${imports.join('\n')}

export default {
${exports.join('\n')}
};
`;

  return entryContent;
}

export async function buildSharedFile(sharedConfig: Record<string, any>, outDir: string): Promise<Record<string, string>> {
  if (Object.keys(sharedConfig).length === 0) {
    return {};
  }

  const entryContent = await generateSharedFileContent(sharedConfig);
  const entry: Record<string, string> = {};

  try {
    await build({
      input: {
        shared: '\0virtual:shared-entry',
      },
      plugins: [
        {
          name: 'virtual:shared-entry',
          resolveId(id) {
            if (id === '\0virtual:shared-entry') {
              return id;
            }
            return null;
          },
          load(id) {
            if (id === '\0virtual:shared-entry') {
              return entryContent;
            }
            return null;
          },
          writeBundle(options, bundle) {
            const bundleKeys = Object.keys(bundle);
            const outDir = (this as any).outputOptions?.dir || 'dist';
            const baseDir = outDir.replace(process.cwd(), '');
            bundleKeys.forEach((key) => {
              const bundleItem = bundle[key];
              if (bundleItem.type === 'chunk' && bundleItem.isEntry) {
                entry[key.endsWith('shared.js') ? 'shared' : 'js'] = path.join(baseDir, key);
              }
            });
          },
        },
      ],
      write: true,
      output: {
        dir: outDir,
        entryFileNames: '[name].js',
        format: 'esm',
        exports: 'named',
      },
      platform: 'browser',
    });
    return entry;
  } catch (error) {
    console.error(`Failed to build shared.js: ${error}`);
    throw error;
  }
}
