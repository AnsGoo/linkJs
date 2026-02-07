import { getLinkInstance } from "..";
import { LIB_EXPOSE } from "../event-bus/constant";

export function exposeLib(libName: string, lib: any, options: any) {
    getLinkInstance().eventBus.emit(LIB_EXPOSE, {
        libName,
        lib,
        options,
    });
}
