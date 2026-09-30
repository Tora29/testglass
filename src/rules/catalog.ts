import type { Severity } from "../schema/types.js";

export interface RuleMeta {
  id: string;
  defaultSeverity: Severity;
  /** 一覧に出す短い名前（指摘項目） */
  label: string;
  /** 設定・README・HTML のツールチップに出す説明 */
  description: string;
  /** なぜ問題なのか */
  why: string;
  /** どう直すか */
  fix: string;
}

/** ルールの一覧。言語・フレームワークをまたいで共通の ID を使う。 */
export const RULES = [
  {
    id: "no-assertions",
    label: "結果の確認なし",
    defaultSeverity: "error",
    description: "アサーション（expect など）が1件もない",
    why: "処理を実行するだけで結果を確認していない。実装が壊れていてもテストは成功する。",
    fix: "テスト名が示す結果を expect で確認する。例: expect(result).toBe(期待値)",
  },
  {
    id: "focused-test",
    label: ".only の残存",
    defaultSeverity: "error",
    description: ".only が残っている",
    why: "同じファイルの他のテストが実行されず、失敗に気づけない。",
    fix: ".only を削除する。",
  },
  {
    id: "skipped-test",
    label: "スキップ・未実装",
    defaultSeverity: "warn",
    description: ".skip / .fixme / .todo が残っている",
    why: "実行されないため、何も保証していない。",
    fix: "修正して有効にするか、削除する。残す場合は理由をコメントに書く。",
  },
  {
    id: "weak-assertions-only",
    label: "真偽のみの確認",
    defaultSeverity: "warn",
    description: "toBeTruthy / toBeDefined など、真偽・存在の確認だけで検証している",
    why: "toBeTruthy / toBeDefined は値があることしか確認しない。誤った値でも成功する。",
    fix: "期待する具体的な値と比較する。例: expect(date).toEqual(new Date(2026, 8, 29))",
  },
  {
    id: "snapshot-only",
    label: "スナップショットのみ",
    defaultSeverity: "warn",
    description: "スナップショットの比較だけで検証している",
    why: "前回の結果との一致しか確認しないため、正しい結果が何かをテストから読み取れない。誤った結果を保存しても気づけない。",
    fix: "重要な値は toBe / toEqual で明示的に確認し、スナップショットは補助にする。",
  },
  {
    id: "mock-calls-only",
    label: "モック呼び出しのみ",
    defaultSeverity: "warn",
    description: "モックの呼び出し検証だけで、結果を見ていない",
    why: "モックが呼ばれたことしか確認しておらず、処理結果の正しさは確認していない。",
    fix: "戻り値や、画面・データの変化も expect で確認する。",
  },
  {
    id: "conditional-assertion",
    label: "条件付きの確認",
    defaultSeverity: "warn",
    description: "条件分岐（if / 三項 / && / switch / catch）の中にアサーションがある",
    why: "条件によっては expect が実行されず、何も確認しないまま成功する。",
    fix: "分岐をなくし、expect が必ず実行されるようにする。例外の確認には toThrow() / rejects を使う。",
  },
  {
    id: "fixed-wait",
    label: "固定時間の待機",
    defaultSeverity: "warn",
    description: "固定時間の待ち（waitForTimeout / sleep など）がある",
    why: "遅い環境では失敗の原因になり、速い環境では時間の無駄になる。",
    fix: "表示や状態の変化を待つ。例: await expect(page.getByText('完了')).toBeVisible()",
  },
  {
    id: "dynamic-test",
    label: "動的生成",
    defaultSeverity: "warn",
    description: "it.each やループなどで動的に生成され、静的解析では展開できない",
    why: "実行時にテストが生成されるため、件数やテストデータをこの仕様書では確認できない。",
    fix: "each に渡すデータやループの内容をソースで確認する。",
  },
  {
    id: "duplicate-title",
    label: "テスト名の重複",
    defaultSeverity: "warn",
    description: "同じ describe の中に同名のテストがある",
    why: "失敗したときに、どのテストが失敗したのか区別できない。",
    fix: "確認する内容が分かる名前に変える。",
  },
  {
    id: "duplicate-body",
    label: "内容の重複",
    defaultSeverity: "warn",
    description: "本体（コメント・空白を除く）が同一のテストがある",
    why: "同じ内容を重複して確認しており、テスト件数を水増ししている。",
    fix: "統合するか、別のケース（境界値・異常系など）を確認する内容に書き換える。",
  },
] as const satisfies readonly RuleMeta[];

export type RuleId = (typeof RULES)[number]["id"];

export const RULE_IDS: readonly string[] = RULES.map((r) => r.id);

export function ruleMeta(id: RuleId): RuleMeta {
  return RULES.find((r) => r.id === id)!;
}
