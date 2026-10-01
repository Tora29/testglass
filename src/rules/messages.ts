import type { Warning } from "../schema/types.js";

const DYNAMIC_MESSAGES: Readonly<Record<string, string>> = {
  each: "it.each / test.for によるテーブル駆動。各行のデータは展開していない",
  loop: "ループの中で宣言されている。件数とテスト名は実行時に決まる",
  title: "テスト名が式で組み立てられている。実際の名前は実行時に決まる",
  body: "本体に関数参照が渡されており、内容を解析できない",
};

/** duplicate-body で名前を挙げるテストの上限（残りは件数だけ示す） */
const MAX_SHOWN_TESTS = 3;

/**
 * 警告の文言。spec.json には文言を持たせず、出力のときにルールID と detail から組み立てる。
 * 未知のルールは ID をそのまま返す。
 */
export function warningMessage(warning: Warning): string {
  const d = warning.detail ?? {};
  switch (warning.rule) {
    case "no-assertions":
      return "expect などによる結果の確認が1件もない";
    case "focused-test":
      return ".only が残っている。同じファイルの他のテストが実行されない";
    case "skipped-test":
      return d.reason === "todo" ? ".todo のまま未実装" : ".skip / .fixme でスキップされている";
    case "weak-assertions-only":
      return "toBeTruthy / toBeDefined などで真偽・存在を確認しているだけで、値を検証していない";
    case "snapshot-only":
      return "スナップショットの比較のみで検証している";
    case "mock-calls-only":
      return "モックの呼び出しのみを検証し、結果（戻り値や状態）を確認していない";
    case "conditional-assertion":
      return "条件分岐の中に expect があり、実行されない場合がある";
    case "fixed-wait":
      return d.code ? `固定時間の待機がある: ${d.code}` : "固定時間の待機がある";
    case "dynamic-test":
      return (d.reason && DYNAMIC_MESSAGES[d.reason]) || "動的に生成され、静的解析では展開できない";
    case "duplicate-title":
      return d.lines
        ? `同じ describe に同名のテストが ${d.lines.length} 件ある（${d.lines.join(", ")} 行目）`
        : "同じ describe に同名のテストがある";
    case "duplicate-body": {
      if (!d.tests?.length) return "本体が同一のテストがある";
      const shown = d.tests.slice(0, MAX_SHOWN_TESTS).map((t) => `「${t.title}」(${t.path}:${t.line})`);
      const rest = d.tests.length - shown.length;
      return `本体が同一のテストがある: ${shown.join("、")}${rest > 0 ? ` ほか ${rest} 件` : ""}`;
    }
    default:
      return warning.rule;
  }
}
