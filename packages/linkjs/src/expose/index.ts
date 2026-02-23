import type Module from 'module';
import { getInstance } from '..';
import { LIB_EXPOSE, SHARED_EXPOSE } from '../event-bus/constant';

export function expose(libName: string, lib: Record<string, Module>, options: any) {
  getInstance().eventBus.emit(LIB_EXPOSE, {
    libName,
    lib,
    options,
  });
}
export function shared(
  libName: string,
  shared: Record<string, Module | (() => Promise<Module>) | (() => Promise<Module | Module>)>,
  options: any,
) {
  getInstance().eventBus.emit(SHARED_EXPOSE, {
    libName,
    shared,
    options,
  });
}
