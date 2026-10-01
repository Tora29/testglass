import { DEFAULT_LANG, getMessages, type Lang } from "../i18n/index.js";
import type { Warning } from "../schema/types.js";

/**
 * 警告の文言。spec.json には文言を持たせず、出力のときにルールID と detail から組み立てる。
 * 未知のルールは ID をそのまま返す。
 */
export function warningMessage(warning: Warning, lang: Lang = DEFAULT_LANG): string {
  return getMessages(lang).warning(warning);
}
