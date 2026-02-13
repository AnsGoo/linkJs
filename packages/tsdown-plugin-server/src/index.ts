import { readFile } from 'fs';
import { createServer as createHttpsServer } from 'https';
import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { resolve, posix } from 'path';
import { Mime } from 'mime/lite';

import standardTypes from 'mime/types/standard.js';
import otherTypes from 'mime/types/other.js';

import opener from 'opener';

let server: Server | null = null;

interface TsdownServeOptions {
  contentBase?: string | string[];
  port: number;
  headers?: Record<string, string>;
  https?: boolean | Record<string, any>;
  openPage?: string;
  onListening?: (server: Server) => void;
  mimeTypes?: Record<string, string>;
  historyApiFallback?: boolean | string;
  host?: string;
  verbose?: boolean;
  open?: boolean;
}

/**
 * Serve your rolled up bundle like webpack-dev-server
 */

function serve(options: TsdownServeOptions | string | string[] = { contentBase: '', port: 10001 }) {
  const mime = new Mime(standardTypes, otherTypes);
  if (Array.isArray(options) || typeof options === 'string') {
    options = { contentBase: options, port: 10001 };
  }
  const contentBase: string[] = Array.isArray(options.contentBase) ? options.contentBase : [options.contentBase || ''];
  const port: number = options.port || 10001;
  const headers: Record<string, string> = options.headers || {};
  const https: boolean | Record<string, any> = options.https || false;
  const openPage: string = options.openPage || '';
  const onListening: (server: Server) => void = options.onListening || function noop() {};
  const host: string = options.host || '';
  const verbose: boolean = options.verbose !== false;
  const open: boolean = options.open || false;
  const historyApiFallback: boolean | string | undefined = options.historyApiFallback;

  if (options.mimeTypes) {
    // Convert mimeTypes to the correct format for mime.define
    const mimeTypesMap: Record<string, string[]> = {};
    Object.keys(options.mimeTypes).forEach((type) => {
      mimeTypesMap[type] = [options.mimeTypes![type]];
    });
    mime.define(mimeTypesMap, true);
  }

  const requestListener = (request: IncomingMessage, response: ServerResponse) => {
    // Remove querystring
    const unsafePath = decodeURI((request.url || '').split('?')[0]);

    // Don't allow path traversal
    const urlPath = posix.normalize(unsafePath);

    Object.keys(headers).forEach((key) => {
      response.setHeader(key, headers[key]);
    });
    response.setHeader('Access-Control-Allow-Origin', '*');

    readFileFromContentBase(contentBase, urlPath, function (error, content, filePath) {
      if (!error && content) {
        return found(response, mime.getType(filePath), content);
      }
      if (error && 'code' in error && error.code !== 'ENOENT') {
        response.writeHead(500);
        response.end(
          '500 Internal Server Error' + '\n\n' + filePath + '\n\n' + Object.values(error).join('\n') + '\n\n(rollup-plugin-serve)',
          'utf-8',
        );
        return;
      }
      if (historyApiFallback) {
        const fallbackPath = typeof historyApiFallback === 'string' ? historyApiFallback : '/index.html';
        readFileFromContentBase(contentBase, fallbackPath, function (error, content, filePath) {
          if (error) {
            notFound(response, filePath);
          } else if (content) {
            found(response, mime.getType(filePath), content);
          }
        });
      } else {
        notFound(response, filePath);
      }
    });
  };

  // release previous server instance if rollup is reloading configuration in watch mode
  if (server) {
    server.close();
  } else {
    closeServerOnTermination();
  }

  // If HTTPS options are available, create an HTTPS server
  server =
    typeof https === 'boolean' && https
      ? createHttpsServer({}, requestListener)
      : typeof https === 'object'
        ? createHttpsServer(https, requestListener)
        : createServer(requestListener);
  server.listen(port, host, () => onListening(server!));

  // Assemble url for error and info messages
  const url = (typeof https === 'boolean' ? https : typeof https === 'object')
    ? 'https'
    : 'http' + '://' + (host || 'localhost') + ':' + port;

  // Handle common server errors
  server.on('error', (e: Error & { code?: string }) => {
    if (e.code === 'EADDRINUSE') {
      console.error(url + ' is in use, either stop the other server or use a different port.');
      process.exit();
    } else {
      throw e;
    }
  });

  let first = true;

  return {
    name: 'serve',
    generateBundle() {
      if (first) {
        first = false;

        // Log which url to visit
        if (verbose) {
          contentBase.forEach((base: string) => {
            console.log(green(url) + ' -> ' + resolve(base));
          });
        }

        // Open browser
        if (open) {
          if (openPage && /https?:\/\/.+/.test(openPage)) {
            opener(openPage);
          } else {
            opener(url + openPage);
          }
        }
      }
    },
  };
}

function readFileFromContentBase(
  contentBase: string[],
  urlPath: string,
  callback: (error: NodeJS.ErrnoException | null, content: Buffer | null, filePath: string) => void,
) {
  let filePath = resolve(contentBase[0] || '.', '.' + urlPath);

  // Load index.html in directories
  if (urlPath.endsWith('/')) {
    filePath = resolve(filePath, 'index.html');
  }

  readFile(filePath, (error, content) => {
    if (error && contentBase.length > 1) {
      // Try to read from next contentBase
      readFileFromContentBase(contentBase.slice(1), urlPath, callback);
    } else {
      // We know enough
      callback(error, content, filePath);
    }
  });
}

function notFound(response: ServerResponse, filePath: string) {
  response.writeHead(404);
  response.end('404 Not Found' + '\n\n' + filePath + '\n\n(rollup-plugin-serve)', 'utf-8');
}

function found(response: ServerResponse, mimeType: string | null, content: Buffer) {
  response.writeHead(200, { 'Content-Type': mimeType || 'text/plain' });
  response.end(content, 'utf-8');
}

function green(text: string) {
  return '\u001b[1m\u001b[32m' + text + '\u001b[39m\u001b[22m';
}

function closeServerOnTermination() {
  const terminationSignals = ['SIGINT', 'SIGTERM', 'SIGQUIT', 'SIGHUP'];
  terminationSignals.forEach((signal) => {
    process.on(signal, () => {
      if (server) {
        server.close();
        process.exit();
      }
    });
  });
}

export default serve;
