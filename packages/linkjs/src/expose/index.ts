import { getInstance } from '..';
import { LIB_EXPOSE, SHARED_EXPOSE } from '../event-bus/constant';
import type { RemoteModule, ShareModule } from '../types';

export function expose(libName: string, lib: RemoteModule, options?: unknown) {
  getInstance().eventBus.emit(LIB_EXPOSE, {
    libName,
    lib,
    options,
  });
}
export function shared(libName: string, shared: Record<string, ShareModule>, options?: unknown) {
  getInstance().eventBus.emit(SHARED_EXPOSE, {
    libName,
    shared,
    options,
  });
}
