import { exposeLib } from "linkjs";
import { createElementBlock, createElementVNode, createTextVNode, defineComponent, openBlock, toDisplayString } from "vue";

//#region \0/plugin-vue/export-helper
var export_helper_default = (sfc, props) => {
	const target = sfc.__vccOpts || sfc;
	for (const [key, val] of props) target[key] = val;
	return target;
};

//#endregion
//#region src/components/HelloWorld.vue
const _hoisted_1 = { class: "greetings" };
const _hoisted_2 = { class: "green" };
const _sfc_main = /* @__PURE__ */ defineComponent({
	__name: "HelloWorld",
	props: { msg: { default: "I am remote app!" } },
	setup(__props) {
		return (_ctx, _cache) => {
			return openBlock(), createElementBlock("div", _hoisted_1, [createElementVNode("h1", _hoisted_2, toDisplayString(__props.msg), 1), _cache[0] || (_cache[0] = createElementVNode("h3", null, [
				createTextVNode(" You’ve successfully created a project with "),
				createElementVNode("a", {
					href: "https://vite.dev/",
					target: "_blank",
					rel: "noopener"
				}, "Vite"),
				createTextVNode(" + "),
				createElementVNode("a", {
					href: "https://vuejs.org/",
					target: "_blank",
					rel: "noopener"
				}, "Vue 3"),
				createTextVNode(". What's next? ")
			], -1))]);
		};
	}
});
var HelloWorld_default = /* @__PURE__ */ export_helper_default(_sfc_main, [["__scopeId", "data-v-b0c50653"]]);

//#endregion
//#region src/index.ts
exposeLib("remote", { HelloWorld: HelloWorld_default }, { version: "1.0.0" });

//#endregion
export { HelloWorld_default as HelloWorld };