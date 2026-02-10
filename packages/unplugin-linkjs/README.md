# unplugin-linkjs

A plugin for automatically generating manifest.json files when building JS packages with tsdown, rollup, vite, webpack, etc.

## Features

- Automatically generates `manifest.json` from your `package.json`
- Supports multiple build tools (tsdown, rollup, vite, webpack, esbuild, etc.)
- Extract only external dependencies (dependencies excluded from the bundle)
- Automatically writes to build output directory (`outDir`)
- Extensible with custom fields

## Installation

```bash
pnpm add unplugin-linkjs -D
```

## Usage

### tsdown

```ts
import { defineConfig } from 'tsdown';
import unpluginLinkjs from 'unplugin-linkjs/tsdown';

export default defineConfig({
  plugins: [
    unpluginLinkjs({
      includeDependencies: true,
      includeDevDependencies: false,
      includePeerDependencies: true,
    }),
  ],
});
```

**Extract only external dependencies:**

```ts
import { defineConfig } from 'tsdown';
import unpluginLinkjs from 'unplugin-linkjs/tsdown';

export default defineConfig({
  external: ['vue', 'react'],
  plugins: [
    unpluginLinkjs({
      includeExternalOnly: true,
    }),
  ],
});
```

### Rollup

```js
import unpluginLinkjs from 'unplugin-linkjs/rollup';

export default {
  plugins: [unpluginLinkjs()],
};
```

### Vite

```ts
import { defineConfig } from 'vite';
import unpluginLinkjs from 'unplugin-linkjs/vite';

export default defineConfig({
  plugins: [unpluginLinkjs()],
});
```

### Webpack

```js
const unpluginLinkjs = require('unplugin-linkjs/webpack');

module.exports = {
  plugins: [unpluginLinkjs()],
};
```

### esbuild

```js
import unpluginLinkjs from 'unplugin-linkjs/esbuild';

await esbuild.build({
  plugins: [unpluginLinkjs()],
});
```

## Options

| Option                | Type                  | Default | Description                                                                                                                                           |
| --------------------- | --------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `includeExternalOnly` | `boolean`             | `true`  | When enabled, only includes dependencies that are in the `external` array of the build config. Dependencies bundled into the output will be excluded. |
| `customFields`        | `Record<string, any>` | `{}`    | Add custom fields to the manifest                                                                                                                     |

## Generated Manifest

The plugin generates a `manifest.json` file in the build output directory (`outDir`) with the following structure:

```json
{
  "name": "your-package-name",
  "version": "1.0.0",
  "main": "./dist/index.mjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.mts",
  "exports": {
    ".": {
      "development": "./src/index.ts",
      "default": "./dist/index.mjs"
    },
    "./package.json": "./package.json"
  },
  "externalDependencies": {
    "vue": "^3.0.0",
    "react": "^18.0.0"
  },
  "files": ["dist"]
}
```

## License

ISC
