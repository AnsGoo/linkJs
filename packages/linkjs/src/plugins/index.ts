import { getInstance, type RegistryOption } from '..';

export interface RuntimePlugin {
  name: string;
  beforeInit?(): void;
  afterInit?(): void;
  beforeLoadRemote?(remoteInfo: RegistryOption): RegistryOption | Promise<RegistryOption>;
  afterLoadRemote?(resolve: (resp: any) => void, reject: (error: any) => void): void;
  errorLoadRemote?(resolve: (resp: any) => void, reject: (error: any) => void | Promise<void>): void | Promise<void>;
  beforeLoadShare?(): void | Promise<void>;
  afterLoadShare?(): void;
  beforeLoadEntry?(): void | Promise<void>;
  afterLoadEntry?(): void;
}

function registerPlugin(plugin: RuntimePlugin) {
  getInstance().plugin = plugin;
}

export { registerPlugin };
