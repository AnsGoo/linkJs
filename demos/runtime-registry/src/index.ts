import type { RegistryOption } from 'linkjs';

const registryOptions: RegistryOption[] = [
  {
    name: 'remote',
    entry: 'index.html',
    dependencies: {
      vue: '^3.5.27',
    },
    type: 'app',
    version: '1.0.0',
  },
  {
    name: 'remote-lib',
    entry: '/mf/lib.js',
    dependencies: {
      vue: '^3.5.27',
    },
    type: 'lib',
    version: '1.0.0',
  },
];

export default registryOptions;
