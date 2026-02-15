import { build } from 'rolldown';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

interface BuildOptions {
  lib: string;
  version: string;
  input: string;
  output: string;
}

interface LibConfig {
  version: string;
  input: string;
}

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function getPackageJson(): PackageJson {
  const packageJsonPath = resolve(process.cwd(), 'package.json');
  const content = readFileSync(packageJsonPath, 'utf-8');
  return JSON.parse(content);
}

function getLibConfig(libName: string): LibConfig | null {
  const packageJson = getPackageJson();
  const allDeps = {
    ...packageJson.dependencies,
  };

  const version = allDeps[libName];
  if (!version) {
    return null;
  }

  try {
    const mainEntry = require.resolve(libName);
    const libDir = resolve(mainEntry, '..');
    console.info(`resolve success${libName}: \n`, mainEntry);
    const possibleInputs = [
      mainEntry
    ];

    for (const input of possibleInputs) {
      if (existsSync(input)) {
        return { version, input };
      }
    }

    console.log(`  警告: ${libName} 的主入口: ${mainEntry}`);
    console.log(`  警告: ${libName} 的库目录: ${libDir}`);
    console.log(`  警告: ${libName} 未找到合适的ES模块入口`);

    return null;
  } catch (error) {
    console.log(`  警告: 无法解析 ${libName} 的位置:`, error);
    return null;
  }
}

function getSupportedLibs(): Record<string, LibConfig> {
  const packageJson = getPackageJson();
  const allDeps = {
    ...packageJson.dependencies,
  };

  const libs: Record<string, LibConfig> = {};

  for (const libName of Object.keys(allDeps)) {
    const config = getLibConfig(libName);
    if (config) {
      libs[libName] = config;
    }
  }

  return libs;
}

export async function buildCdnEsPackage(options: BuildOptions) {
  const { lib, version, input, output } = options;

  // 确保输出目录存在
  const outputDir = resolve(output);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // 构建配置
  const config = {
    input: input,
    output: {
      format: 'esm' as const,
      dir: outputDir,
      entryFileNames: `${lib}.esm.js`,
      sourcemap: true,
    },
    external: [], // 不外部化依赖，确保所有代码都打包进来
  };

  // 执行构建
  try {
    const result = await build(config);
    console.log(`成功为 ${lib} v${version} 生成 CDN es 包: ${resolve(outputDir, `${lib}.esm.js`)}`);
    return result;
  } catch (error) {
    console.error(`构建 ${lib} 时出错:`, error);
    throw new Error(`构建 ${lib} 失败`);
  }
}

// 主函数
export async function main(lib: string) {
  const supportedLibs = getSupportedLibs();

  if (!supportedLibs[lib]) {
    console.error(`不支持的库: ${lib}`);
    console.error(`支持的库: ${Object.keys(supportedLibs).join(', ')}`);
    process.exit(1);
  }

  const libConfig = supportedLibs[lib];

  await buildCdnEsPackage({
    lib,
    version: libConfig.version,
    input: libConfig.input,
    output: `./dist/${lib}`,
  });
}

// 构建所有支持的库
export async function buildAll() {
  const supportedLibs = getSupportedLibs();
  const libNames = Object.keys(supportedLibs);

  if (libNames.length === 0) {
    console.log('没有找到可用的库');
    return;
  }

  console.log(`开始构建 ${libNames.length} 个库的CDN包...`);
  console.log('');

  const results = [];
  const errors = [];

  for (const libName of libNames) {
    const libConfig = supportedLibs[libName];
    try {
      console.log(`[${results.length + 1}/${libNames.length}] 正在构建 ${libName} (${libConfig.version})...`);
      await buildCdnEsPackage({
        lib: libName,
        version: libConfig.version,
        input: libConfig.input,
        output: `./dist/${libName}`,
      });
      results.push(libName);
      console.log('');
    } catch (error) {
      console.error(`构建 ${libName} 失败:`, error);
      errors.push({ lib: libName, error });
      console.log('');
    }
  }

  console.log('='.repeat(50));
  console.log(`构建完成！`);
  console.log(`成功: ${results.length}/${libNames.length}`);
  console.log(`失败: ${errors.length}/${libNames.length}`);

  if (results.length > 0) {
    console.log('');
    console.log('成功构建的库:');
    results.forEach((lib) => console.log(`  ✓ ${lib}`));
  }

  if (errors.length > 0) {
    console.log('');
    console.log('构建失败的库:');
    errors.forEach(({ lib, error }) => console.log(`  ✗ ${lib}: ${error}`));
  }

  if (errors.length > 0) {
    process.exit(1);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  const lib = process.argv[2];

  if (lib === '--all') {
    buildAll();
  } else if (!lib) {
    const supportedLibs = getSupportedLibs();
    console.log('可用的库:');
    for (const [name, config] of Object.entries(supportedLibs)) {
      console.log(`  - ${name} (${config.version})`);
    }
    console.log('\n使用方法: npm run build:cdn <库名>');
    console.log('例如: npm run build:cdn vue');
    console.log('或者: npm run build:all');
    process.exit(0);
  } else {
    main(lib);
  }
}
