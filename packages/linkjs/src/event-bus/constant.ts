const LIB_EXPOSE = 'libExpose';
const SHARED_EXPOSE = 'SharedExpose';

const LIB_READY = 'libReady';
const SHARED_READY = 'SharedReady';

/** 远程应用已加载后再次 expose（HMR）或组件对象被替换时广播。 */
const REMOTE_UPDATE = 'remoteUpdate';

const LOAD_STATUS = {
  LOADED: 'loaded',
  UNLOADED: 'unloaded',
  LOADING: 'loading',
};

export { LIB_EXPOSE, SHARED_EXPOSE, LIB_READY, SHARED_READY, REMOTE_UPDATE, LOAD_STATUS };
