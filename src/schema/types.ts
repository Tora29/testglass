/**
 * 中間JSON（spec.json）のスキーマ定義。
 *
 * 入力アダプタはこの形式に変換し、出力アダプタはこの形式だけを読む。
 * 互換性のない変更をするときは SCHEMA_VERSION を上げること。
 */

export const SCHEMA_VERSION = 1 as const;

/** spec.json のルート。毎回その時点の断面で上書きされ、履歴は持たない。 */
export interface SpecJson {
  schemaVersion: typeof SCHEMA_VERSION;
  /** 生成日時（ローカルタイムゾーンのオフセット付き ISO 8601） */
  generatedAt: string;
  /** path の昇順 */
  files: TestFile[];
}

export interface TestFile {
  /** ルートディレクトリからの相対パス（区切りは "/"） */
  path: string;
  /** 解析した入力アダプタの name（"vitest" | "playwright" | ...） */
  framework: string;
  /** ソース上の出現順 */
  tests: TestCase[];
}

export interface TestCase {
  /** ファイルパス＋describe階層＋テスト名のハッシュ。テスト名が変われば別のテストになる */
  id: string;
  /** 外側から順に並べた describe のタイトル */
  suites: string[];
  title: string;
  /** テスト宣言の位置（1始まり） */
  location: SourceLocation;
  /** 外側の describe から引き継いだものも含む */
  modifiers: Modifier[];
  /** テストが行っている操作の要約（ルールベース。LLMは使わない） */
  steps: string[];
  /** 検証内容（期待結果） */
  assertions: Assertion[];
  warnings: Warning[];
  /** テスト宣言全体のソース */
  source: string;
  /**
   * テスト本体（タイトルを除く）を正規化したハッシュ。
   * 重複検出や、2断面の比較で「名前だけ変わったテスト」を追跡するのに使う。
   * 本体を静的に特定できない場合は省略される。
   */
  fingerprint?: string;
}

export interface SourceLocation {
  line: number;
  column: number;
}

export type Modifier = "skip" | "only" | "todo" | "each";

export const MODIFIERS: readonly Modifier[] = ["skip", "only", "todo", "each"];

export interface Assertion {
  line: number;
  /** アサーション式のソース（空白は1つに詰める） */
  text: string;
}

export type Severity = "error" | "warn";

/**
 * 警告。表示する文言は持たず、出力のときにルールID と detail から組み立てる
 * （spec.json を表示の言語に依存させないため。src/rules/messages.ts）。
 */
export interface Warning {
  /** ルールID（例: "no-assertions"） */
  rule: string;
  severity: Severity;
  /** 警告の根拠になった行（あれば） */
  line?: number;
  /** ルールごとの詳細（あれば） */
  detail?: WarningDetail;
}

/** 警告の詳細。どの項目を使うかはルールによる */
export interface WarningDetail {
  /**
   * 警告の理由の種類
   * - skipped-test: "skip"（.skip / .fixme）| "todo"
   * - dynamic-test: "each" | "loop" | "title" | "body"（DynamicFact の reason）
   */
  reason?: string;
  /** fixed-wait: 待機しているコード */
  code?: string;
  /** duplicate-title: 同名のテストの行（昇順。自分も含む） */
  lines?: number[];
  /** duplicate-body: 本体が同一のほかのテスト */
  tests?: TestRef[];
}

/** ほかのテストへの参照 */
export interface TestRef {
  path: string;
  title: string;
  line: number;
}
