import { getInstance } from '..';
import { LIB_EXPOSE } from '../event-bus/constant';

export function expose(libName: string, lib: any, options: any) {
  getInstance().eventBus.emit(LIB_EXPOSE, {
    libName,
    lib,
    options,
  });
}
