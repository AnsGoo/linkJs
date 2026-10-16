import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import vitesseDark from '@shikijs/themes/vitesse-dark';
import langTypeScript from '@shikijs/langs/typescript';
import langJavaScript from '@shikijs/langs/javascript';
import langVue from '@shikijs/langs/vue';
import langBash from '@shikijs/langs/bash';
import langJson from '@shikijs/langs/json';
import langHtml from '@shikijs/langs/html';

/** 单例 highlighter（细粒度：仅加载用到的语言与主题；JS 引擎，无需 wasm）。 */
export const THEME = 'vitesse-dark';

const highlighter: Promise<HighlighterCore> = createHighlighterCore({
  themes: [vitesseDark],
  langs: [langTypeScript, langJavaScript, langVue, langBash, langJson, langHtml],
  engine: createJavaScriptRegexEngine(),
});

export function getHighlighter(): Promise<HighlighterCore> {
  return highlighter;
}

export async function highlightToHtml(code: string, lang = 'ts'): Promise<string> {
  const hl = await highlighter;
  return hl.codeToHtml(code, { lang, theme: THEME });
}
