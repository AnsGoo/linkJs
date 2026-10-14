/**
 * 解析入口里的 `expose('<remote>', { Name: <module>, ... })` 调用，
 * 得到 **expose 名 → 本地标识符**，以及该文件的 **导入绑定（本地名 → 源说明符）**。
 * 二者结合即可把 expose 名映射到具体模块，用于构建期补全 `exposes[].deps`。
 *
 * 纯函数、无副作用，便于单测。
 */

export interface ExposeDecl {
  name: string;
  /** 该 expose 对应的本地标识符（如 `HelloWorld`）；非标识符（表达式）时为 undefined。 */
  local?: string;
}

function literalOrIdentifierName(key: any): string | undefined {
  if (!key) {
    return undefined;
  }
  if (key.type === 'Identifier') {
    return key.name;
  }
  if (key.type === 'Literal' && typeof key.value === 'string') {
    return key.value;
  }
  return undefined;
}

/** 遍历 AST，收集 `expose(...)` 的 expose 名与本地标识符。 */
export function collectExposeDecls(node: any): ExposeDecl[] {
  const decls: ExposeDecl[] = [];
  const visit = (n: any): void => {
    if (!n || typeof n !== 'object') {
      return;
    }
    if (n.type === 'CallExpression' && n.callee?.type === 'Identifier' && n.callee.name === 'expose') {
      const obj = n.arguments?.[1];
      if (obj?.type === 'ObjectExpression') {
        for (const prop of obj.properties ?? []) {
          if (prop?.type !== 'Property') {
            continue;
          }
          const name = literalOrIdentifierName(prop.key);
          if (!name) {
            continue;
          }
          const local = prop.value?.type === 'Identifier' ? prop.value.name : undefined;
          decls.push({ name, local });
        }
      }
    }
    if (Array.isArray(n.body)) {
      n.body.forEach(visit);
    }
    if (n.expression && typeof n.expression === 'object') {
      visit(n.expression);
    }
    if (Array.isArray(n.declarations)) {
      n.declarations.forEach(visit);
    }
  };
  visit(node);
  return decls;
}

/** 收集 import 绑定：本地名 → 源说明符（如 `HelloWorld` → `./components/HelloWorld.vue`）。 */
export function collectImportSources(node: any): Map<string, string> {
  const map = new Map<string, string>();
  const visit = (n: any): void => {
    if (!n || typeof n !== 'object') {
      return;
    }
    if (n.type === 'ImportDeclaration') {
      for (const spec of n.specifiers ?? []) {
        if (spec?.local?.name && typeof n.source?.value === 'string') {
          map.set(spec.local.name, n.source.value);
        }
      }
    }
    if (Array.isArray(n.body)) {
      n.body.forEach(visit);
    }
  };
  visit(node);
  return map;
}

/** 组合：expose 名 → 源模块说明符。 */
export function resolveExposeSources(node: any): Map<string, string | undefined> {
  const imports = collectImportSources(node);
  const result = new Map<string, string | undefined>();
  for (const decl of collectExposeDecls(node)) {
    result.set(decl.name, decl.local ? imports.get(decl.local) : undefined);
  }
  return result;
}
