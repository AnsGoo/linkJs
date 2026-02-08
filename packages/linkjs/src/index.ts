import { linkInstance } from "./instance";
import { __LINKJS_INSTANCE__ } from "./constant";
import { getRemote, loadRemote } from "./loader";
import { exposeLib } from "./share";

// @ts-ignore
window[__LINKJS_INSTANCE__] = linkInstance;

function getLinkInstance() {
    return linkInstance;
}

export { getLinkInstance, loadRemote, exposeLib, getRemote };