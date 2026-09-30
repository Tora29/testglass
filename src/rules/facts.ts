import type { Assertion, Modifier, SourceLocation } from "../schema/types.js";

/**
 * 入力アダプタが解析結果として作る「テストの事実」。
 * 警告ルールは言語に依存しないよう、AST ではなくこの形式を見て判定する。
 * 新しい言語のアダプタも、この形式を作れば同じルールをそのまま使える。
 */
export interface TestFacts {
  /** ルートからの相対パス（"/" 区切り） */
  path: string;
  suites: string[];
  title: string;
  location: SourceLocation;
  modifiers: Modifier[];
  steps: string[];
  source: string;
  assertions: AssertionFact[];
  /** 固定時間の待ち（waitForTimeout、sleep(1000) など） */
  fixedWaits: CodeRef[];
  /** 静的解析では展開・特定できない要素 */
  dynamic: DynamicFact[];
  /** テスト本体の関数を静的に特定できたか（関数参照を渡している場合は false） */
  bodyResolved: boolean;
  /** 本体を正規化したテキスト（重複検出用。ハッシュ化してから出力する） */
  normalizedBody?: string;
}

export interface CodeRef {
  line: number;
  text: string;
}

/**
 * - value: 値を比較する（toBe / toEqual / toHaveURL など）
 * - truthiness: 真偽・存在だけを見る（toBeTruthy / toBeDefined など）
 * - snapshot: スナップショット・スクリーンショット比較
 * - mock-call: モックの呼び出しを検証する（toHaveBeenCalledWith など）
 * - helper: expectXxx() のような自作ヘルパー（中身は追わない）
 */
export type AssertionKind = "value" | "truthiness" | "snapshot" | "mock-call" | "helper";

export interface AssertionFact extends Assertion {
  kind: AssertionKind;
  /** if / 三項演算子 / && / switch / catch の中にあり、実行されない可能性がある */
  conditional: boolean;
}

export interface DynamicFact {
  /**
   * - each: it.each / test.for などのテーブル駆動
   * - loop: for 文や forEach の中でテストを宣言している
   * - title: テスト名が式で組み立てられている
   * - body: テスト本体に関数参照を渡している
   */
  reason: "each" | "loop" | "title" | "body";
  line: number;
}
