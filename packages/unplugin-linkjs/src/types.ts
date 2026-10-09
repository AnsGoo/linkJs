export interface ManifestJson {
  name: string;
  version: string;
  description: string;
  entry: {
    js?: string;
    css?: string;
    html?: string;
    i18n?: string;
    shared?: string;
    expose?: string;
    types?: string;
  };
  expose?: string[];
  shared?: Record<
    string,
    {
      version: string;
      scope: 'global' | string;
      singleton: boolean;
      dependencies?: string[];
    }
  >;
  [key: string]: any;
}

export interface UnpluginLinkjsOptions {
  extensions?: string[];
  shared?: Record<
    string,
    {
      lib?: string | any | (() => any) | (() => Promise<any>);
      scope?: 'global' | string;
      singleton?: boolean;
    }
  >;
  isReplaceLinkjs?: boolean;
  exposeOptions?: {
    name?: string;
    version?: string;
  };
}
