import { DEFAULT_LANG, getMessages, type Lang } from "../i18n/index.js";

/**
 * testglass が投げるエラーの種類と値。
 * 文言は持たず、表示のときに言語を選んで組み立てる（src/i18n/ の errors）。
 */
export type ErrorDetail =
  | { code: "config-not-found"; path: string }
  | { code: "config-not-object"; path: string }
  | { code: "invalid-lang"; option: string; value: unknown; langs: readonly string[] }
  | { code: "unknown-framework-adapter"; name: string }
  | { code: "rules-not-object" }
  | { code: "unknown-rule"; rule: string; rules: readonly string[] }
  | { code: "invalid-rule-value"; rule: string; value: unknown }
  | { code: "invalid-fail-on"; value: string }
  | { code: "extra-args"; args: readonly string[] }
  | { code: "missing-spec-path" }
  | { code: "unknown-command"; command: string }
  | { code: "unknown-format"; format: string; formats: readonly string[] }
  | { code: "unreadable-spec"; path: string; reason: string }
  | { code: "unsupported-schema"; version: unknown; supported: number };

/** testglass のエラー。message は既定の言語（日本語）の文言 */
export class TestglassError extends Error {
  constructor(
    readonly detail: ErrorDetail,
    /** エラーの原因になったファイル（設定ファイルなど）。文言の先頭に付ける */
    readonly file?: string,
    /** 表示に使う言語の手がかり（誤りのある設定ファイルに書かれていた lang） */
    readonly lang?: Lang,
  ) {
    super(formatError(detail, file, DEFAULT_LANG));
    this.name = "TestglassError";
  }
}

/** エラーの文言。TestglassError は指定した言語で組み立て、それ以外は message をそのまま返す */
export function errorMessage(error: unknown, lang: Lang = DEFAULT_LANG): string {
  if (error instanceof TestglassError) return formatError(error.detail, error.file, lang);
  return error instanceof Error ? error.message : String(error);
}

function formatError(detail: ErrorDetail, file: string | undefined, lang: Lang): string {
  const text = getMessages(lang).errors(detail);
  return file ? `${file}: ${text}` : text;
}
