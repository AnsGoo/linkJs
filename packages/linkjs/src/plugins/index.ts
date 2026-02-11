import { getInstance } from "..";

 export interface RuntimePlugin {
  name: string;
  beforeInit(): void;
  afterInit(): void;
  beforeLoadRemote(): void|Promise<void>;
  afterLoadRemote(): void;
  errorLoadRemote(): void|Promise<void>;

  beforeLoadShare(): void|Promise<void>;
  afterLoadShare(): void;
  beforeLoadEntry(): void|Promise<void>;
  afterLoadEntry(): void;
}

function registerPlugins(plugins: RuntimePlugin[]) {
  getInstance().plugins.push(...plugins);
}

export { registerPlugins };
