# share-runtime

A tool for automatically generating CDN ES modules for multiple libraries from your dependencies.

## Features

- Automatically generates CDN ES modules for libraries in your `package.json`
- Supports both npm packages and workspace dependencies
- Uses `require.resolve` to find the real location of dependencies
- Intelligent ES module entry point detection
- Build all dependencies at once or individually
- Generates sourcemaps for debugging
- Works with various library structures (dist, esm, etc.)

## Installation

```bash
pnpm add share-runtime -D
```

## Usage

### Quick Start

Add the libraries you want to generate CDN modules for to your `package.json`:

```json
{
  "dependencies": {
    "vue": "^3.5.27",
    "react": "^18.0.0",
    "linkjs": "workspace:*"
  }
}
```

### Build Commands

#### Build all dependencies at once

```bash
npm run build:all
```

This will build CDN ES modules for all dependencies that have a valid ES module entry point.

#### Build a specific library

```bash
npm run build:cdn vue
```

#### List available libraries

```bash
npm run build:cdn
```

This will show all libraries that can be built with their versions.

## How It Works

The tool automatically:

1. Reads your `package.json` to find dependencies
2. Uses `require.resolve` to find the real location of each dependency
3. Searches for ES module entry points in common locations:
   - Main entry point (from package.json)
   - `dist/${libName}.esm-browser.js`
   - `dist/${libName}.esm.js`
   - `dist/index.esm.js`
   - `dist/${libName}.mjs`
   - `dist/index.mjs`
   - `esm/index.js`
   - `esm/${libName}.js`
   - And more...
4. Builds each library into a standalone CDN ES module
5. Outputs to `dist/${libName}/${libName}.esm.js` with sourcemaps

## Output Structure

After building, the output directory will look like:

```
dist/
├── vue/
│   ├── vue.esm.js
│   └── vue.esm.js.map
├── react/
│   ├── react.esm.js
│   └── react.esm.js.map
└── linkjs/
    ├── linkjs.esm.js
    └── linkjs.esm.js.map
```

## Adding New Libraries

To add a new library to the build process:

1. Add it to your `package.json` dependencies:

```json
{
  "dependencies": {
    "vue": "^3.5.27",
    "your-library": "^1.0.0"
  }
}
```

2. Run the build command:

```bash
npm run build:all
```

The tool will automatically detect and build the new library if it has a valid ES module entry point.

## Supported Library Types

- **npm packages**: Regular packages from npm registry
- **workspace packages**: Local packages using `workspace:*` protocol
- **Monorepo packages**: Packages in a monorepo setup

## Troubleshooting

### Library not found in available list

If a library doesn't appear in the available list:

1. Check if it's in your `package.json` dependencies
2. Ensure the library has been installed: `pnpm install`
3. Check if the library has a valid ES module entry point

### Build fails for a specific library

If a library fails to build:

1. Run `npm run build:cdn <library-name>` to see detailed error messages
2. Check if the library's ES module file exists
3. Verify the library is properly installed

### Workspace dependencies not found

For workspace dependencies:

1. Ensure the workspace package is built: `cd packages/your-package && npm run build`
2. Run `pnpm install` at the root to link workspace packages
3. Verify the workspace is configured in `pnpm-workspace.yaml`

## Configuration

The tool automatically detects library configurations from `package.json`. No additional configuration is needed.

## Examples

### Example 1: Build Vue CDN module

```bash
npm run build:cdn vue
```

Output: `dist/vue/vue.esm.js`

### Example 2: Build all dependencies

```bash
npm run build:all
```

Builds all available dependencies in sequence.

### Example 3: Check available libraries

```bash
npm run build:cdn
```

Output:

```
可用的库:
  - vue (^3.5.27)
  - react (^18.0.0)
  - linkjs (workspace:*)
```

## License

ISC
