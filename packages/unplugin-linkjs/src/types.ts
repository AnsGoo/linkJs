export interface ManifestJson {
  name: string;
  version: string;
  types?: string;
  exports?: Record<string, string>;
  dependencies?: Record<string, string>;
  [key: string]: any;
}

export interface UnpluginLinkjsOptions {
  extensions?: string[];
  shared?: Record<string, any>;
}
