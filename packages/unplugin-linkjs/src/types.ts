export interface ManifestJson {
  name: string;
  version: string;
  types?: string;
  exports?: Record<string, string>;
  dependencies?: Record<string, string>;
  [key: string]: any;
}

export interface UnpluginLinkjsOptions {
  includeExternalOnly?: boolean;
  customFields?: Record<string, any>;
}
