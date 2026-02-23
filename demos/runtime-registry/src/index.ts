import type { RegistryOption } from 'linkjs';

const registryOptions: RegistryOption[] = [
  {
    name: 'remote',
    entry: {
      html: 'dist/index.html',
      js: 'dist/index.js',
    },
    shared: {
      vue: {
        version: '^3.5.27',
        scope: 'global',
        singleton: true,
      },
    },
    type: 'app',
    version: '1.0.0',
  },
  {
    name: 'remote-lib',
    entry: {
      types: '/mf/lib.d.ts',
      js: '/mf/lib.js',
      css: '/mf/style.css',
      shared: '/mf/shared.js',
    },
    shared: {
      vue: {
        version: '^3.5.27',
        scope: 'global',
        singleton: true,
      },
    },
    type: 'app',
    version: '1.0.0',
  },
  {
    name: 'remote-lib',
    entry: {
      types: '/mf/lib.d.ts',
      js: '/mf/lib.js',
      css: '/mf/style.css',
      shared: '/mf/shared.js',
    },
    shared: {
      vue: {
        version: '^3.5.27',
        scope: 'global',
        singleton: true,
      },
      pinia: {
        version: '^3.0.4',
        scope: 'global',
        singleton: true,
      },
      'vue-router': {
        version: '^5.0.1',
        scope: 'global',
        singleton: true,
      },
    },
    type: 'lib',
    version: '1.0.0',
  },
];

export default registryOptions;
