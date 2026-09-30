import type { SpecJson, TestFile } from "../schema/types.js";

/**
 * 入力アダプタ：テストのソースを共通形式（TestFile）に変換する。
 * フレームワークを増やすときは、これを1つ実装して登録する。
 */
export interface InputAdapter {
  /** "vitest" | "playwright" | ...（TestFile.framework にそのまま入る） */
  name: string;
  /**
   * 対象ファイルか判定する。
   * Vitest と Playwright はどちらも *.spec.ts を使うため、パスだけでなく
   * ソース（import 元など）も見て判定できるようにしている。
   */
  match(filePath: string, source: string): boolean;
  /**
   * 共通形式に変換する。warnings には各ルールの既定の重大度で入れておけばよく、
   * 設定による無効化や重大度の変更、ファイルをまたぐルールの適用はコアが行う。
   */
  parse(filePath: string, source: string): TestFile;
}

/** 出力されるファイル。path は出力ディレクトリからの相対パス。 */
export interface OutputFile {
  path: string;
  content: string;
}

/**
 * 出力アダプタ：spec.json から成果物を生成する。
 * 出力形式を増やすときは、これを1つ実装して登録する。
 */
export interface OutputAdapter<Options = unknown> {
  /** "html" | "markdown" | ...（CLI の --format で指定する名前） */
  name: string;
  render(spec: SpecJson, options?: Options): OutputFile[];
}
