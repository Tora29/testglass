import type { Messages } from "./index.js";

const DYNAMIC_MESSAGES: Readonly<Record<string, string>> = {
  each: "it.each / test.for によるテーブル駆動。各行のデータは展開していない",
  loop: "ループの中で宣言されている。件数とテスト名は実行時に決まる",
  title: "テスト名が式で組み立てられている。実際の名前は実行時に決まる",
  body: "本体に関数参照が渡されており、内容を解析できない",
};

/** duplicate-body で名前を挙げるテストの上限（残りは件数だけ示す） */
const MAX_SHOWN_TESTS = 3;

export const ja: Messages = {
  title: "テスト仕様書",
  staticAnalysis: "静的解析（テストは実行していない）",
  verdicts: { error: "要修正", warn: "要確認", ok: "問題なし" },
  modifiers: {
    skip: { label: "スキップ", title: ".skip / .fixme：実行されない" },
    only: { label: "only", title: ".only：このテストだけが実行される" },
    todo: { label: "未実装", title: ".todo：名前だけで中身がない" },
    each: { label: "データ駆動", title: "it.each など：データの数だけ実行時に生成される" },
  },
  stepVerbs: {
    goto: "開く",
    reload: "再読み込み",
    goBack: "戻る",
    goForward: "進む",
    click: "クリック",
    dblclick: "ダブルクリック",
    tap: "タップ",
    fill: "入力",
    type: "入力",
    pressSequentially: "入力",
    insertText: "入力",
    press: "キー入力",
    down: "キー押下",
    up: "キー解放",
    check: "チェック",
    uncheck: "チェック解除",
    setChecked: "チェック設定",
    selectOption: "選択",
    selectText: "テキスト選択",
    hover: "ホバー",
    focus: "フォーカス",
    blur: "フォーカス解除",
    clear: "クリア",
    setInputFiles: "ファイル指定",
    dragTo: "ドラッグ",
    dragAndDrop: "ドラッグ",
    move: "マウス移動",
    wheel: "スクロール",
    waitForTimeout: "待機",
  },
  mock: { label: "モック", title: "本物の代わりの部品を用意している" },
  noAssertions: { todo: "未実装", none: "なし" },
  rules: {
    "no-assertions": {
      label: "expect がない",
      description: "アサーション（expect など）が1件もない",
      why: "処理を実行するだけで結果を確認していない。実装が壊れていてもテストは成功する。",
      fix: "テスト名が示す結果を expect で確認する。例: expect(result).toBe(期待値)",
    },
    "focused-test": {
      label: ".only が残っている",
      description: ".only が残っている",
      why: "同じファイルの他のテストが実行されず、失敗に気づけない。",
      fix: ".only を削除する。",
    },
    "skipped-test": {
      label: "skip・todo が残っている",
      description: ".skip / .fixme / .todo が残っている",
      why: "実行されないため、何も保証していない。",
      fix: "修正して有効にするか、削除する。残す場合は理由をコメントに書く。",
    },
    "weak-assertions-only": {
      label: "toBeTruthy だけ",
      description: "toBeTruthy / toBeDefined など、真偽・存在の確認だけで検証している",
      why: "toBeTruthy / toBeDefined は値があることしか確認しない。誤った値でも成功する。",
      fix: "期待する具体的な値と比較する。例: expect(date).toEqual(new Date(2026, 8, 29))",
    },
    "snapshot-only": {
      label: "スナップショットだけ",
      description: "スナップショットの比較だけで検証している",
      why: "前回の結果との一致しか確認しないため、正しい結果が何かをテストから読み取れない。誤った結果を保存しても気づけない。",
      fix: "重要な値は toBe / toEqual で明示的に確認し、スナップショットは補助にする。",
    },
    "mock-calls-only": {
      label: "モックの呼び出しだけ",
      description: "モックの呼び出し検証だけで、結果を見ていない",
      why: "モックが呼ばれたことしか確認しておらず、処理結果の正しさは確認していない。",
      fix: "戻り値や、画面・データの変化も expect で確認する。",
    },
    "conditional-assertion": {
      label: "分岐の中の expect",
      description: "条件分岐（if / 三項 / && / switch / catch）の中にアサーションがある",
      why: "条件によっては expect が実行されず、何も確認しないまま成功する。",
      fix: "分岐をなくし、expect が必ず実行されるようにする。例外の確認には toThrow() / rejects を使う。",
    },
    "fixed-wait": {
      label: "固定時間の sleep",
      description: "固定時間の待ち（waitForTimeout / sleep など）がある",
      why: "遅い環境では失敗の原因になり、速い環境では時間の無駄になる。",
      fix: "表示や状態の変化を待つ。例: await expect(page.getByText('完了')).toBeVisible()",
    },
    "dynamic-test": {
      label: "each・ループで生成",
      description: "it.each やループなどで動的に生成され、静的解析では展開できない",
      why: "実行時にテストが生成されるため、件数やテストデータをこの仕様書では確認できない。",
      fix: "each に渡すデータやループの内容をソースで確認する。",
    },
    "duplicate-title": {
      label: "同名のテスト",
      description: "同じ describe の中に同名のテストがある",
      why: "失敗したときに、どのテストが失敗したのか区別できない。",
      fix: "確認する内容が分かる名前に変える。",
    },
    "duplicate-body": {
      label: "中身が同じテスト",
      description: "本体（コメント・空白を除く）が同一のテストがある",
      why: "同じ内容を重複して確認しており、テスト件数を水増ししている。",
      fix: "統合するか、別のケース（境界値・異常系など）を確認する内容に書き換える。",
    },
  },
  warning(w) {
    const d = w.detail ?? {};
    switch (w.rule) {
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
        return w.rule;
    }
  },
  markdown: {
    issues: "指摘",
    issuesHeader: ["判定", "指摘", "件数"],
    caseHeader: ["項番", "テスト名", "手順", "期待結果", "判定"],
    noTests: "テストが見つからない",
    outsideDescribe: "（describe の外）",
    modifier: (label) => `［${label}］`,
  },
  csv: {
    header: [
      "項番",
      "ファイル",
      "フレームワーク",
      "describe",
      "テスト名",
      "修飾子",
      "手順",
      "期待結果",
      "判定",
      "指摘",
      "行",
    ],
    listSeparator: "、",
  },
  html: {
    filterByVerdict: "判定で絞り込む",
    filterByFramework: "フレームワークで絞り込む",
    filterByRule: "指摘の種類で絞り込む",
    search: "検索",
    searchLabel: "検索（テスト名・手順・期待結果・ファイル名）",
    expandAll: "すべて開く",
    collapseAll: "閉じる",
    switchTheme: "表示テーマを切り替える",
    themes: { auto: "表示: OS の設定に従う", light: "表示: ライト", dark: "表示: ダーク" },
    all: "すべて",
    noIssues: "指摘なし",
    ruleChipTitle: "{description}（{id}）",
    openDetails: "{no} の詳細を開く",
    columns: { no: "項番", title: "テスト名", steps: "手順", expected: "期待結果", verdict: "判定" },
    jumpToLine: "{line} 行目 →",
    issues: "指摘",
    why: "理由",
    fix: "対処",
    source: "ソース",
    assertLine: "検証している行",
    warnLine: "指摘のある行",
    noTests: "テストが見つからない",
    noResults: "該当するテストはない",
    clearFilters: "絞り込みを解除",
  },
  cli: {
    help: `testglass — テストコードからレビュー用のテスト仕様書を作る

使い方:
  testglass [options]                   テストを読んで spec.json と成果物（HTML）をまとめて生成
  testglass collect [options]           テストを読んで spec.json を上書き
  testglass render <spec.json> [opts]   spec.json から成果物を生成
  testglass schema [--out <file>]       spec.json の JSON Schema を出力

オプション:
  --root <dir>        解析するルートディレクトリ（既定: カレントディレクトリ）
  --out <file>        spec.json の出力先（既定: testglass/spec.json）
  --format <names>    出力形式（html / md / csv をカンマ区切り。既定: html）
  --out-dir <dir>     成果物の出力先（既定: spec.json と同じディレクトリ）
  --lang <lang>       成果物とメッセージの言語（ja / en。既定: ja）
  --config <file>     設定ファイル（既定: ルートの testglass.config.{mjs,js,json}）
  --fail-on <level>   error / warn の警告が1件でもあれば終了コード 1 を返す
  -h, --help          このヘルプを表示
  -v, --version       バージョンを表示

English: testglass --help --lang en
`,
    seeHelp: "`testglass --help` で使い方を確認できます。",
    collected: (s) =>
      `✔ ${s.files} ファイル / ${s.tests} テストを解析しました → ${s.path}\n` +
      `  警告: error ${s.errors} 件 / warn ${s.warns} 件（警告のあるテスト ${s.testsWithWarnings} 件）`,
    unmatched: (paths) =>
      `  どの入力アダプタにも該当しなかったファイル（${paths.length} 件）:\n` +
      paths.map((p) => `    - ${p}\n`).join("") +
      "  自動判定が外れている場合は、設定ファイルの frameworks で指定してください。",
    rendered: (format, path) => `✔ ${format} を出力しました → ${path}`,
  },
  errors(e) {
    switch (e.code) {
      case "config-not-found":
        return `設定ファイルが見つかりません: ${e.path}`;
      case "config-not-object":
        return `設定ファイルはオブジェクトを返してください: ${e.path}`;
      case "invalid-lang":
        return `${e.option} には ${e.langs.join(" / ")} のいずれかを指定してください（指定値: ${JSON.stringify(e.value)}）`;
      case "unknown-framework-adapter":
        return `frameworks に未知のアダプタが指定されています: "${e.name}"`;
      case "rules-not-object":
        return "rules はオブジェクトで指定してください";
      case "unknown-rule":
        return `未知のルールです: "${e.rule}"（指定できるルール: ${e.rules.join(", ")}）`;
      case "invalid-rule-value":
        return `ルール "${e.rule}" の値は "off" / "warn" / "error" のいずれかにしてください（指定値: ${JSON.stringify(e.value)}）`;
      case "invalid-fail-on":
        return `--fail-on には error か warn を指定してください（指定値: ${e.value}）`;
      case "extra-args":
        return `余分な引数があります: ${e.args.join(" ")}`;
      case "missing-spec-path":
        return "render には spec.json のパスを指定してください";
      case "unknown-command":
        return `未知のコマンドです: ${e.command}`;
      case "unknown-format":
        return `未知の出力形式です: ${e.format}（使える形式: ${e.formats.join(", ")}）`;
      case "unreadable-spec":
        return `spec.json を読めません: ${e.path}（${e.reason}）`;
      case "unsupported-schema":
        return `対応していない schemaVersion です: ${String(e.version)}（このバージョンは ${e.supported} に対応）`;
    }
  },
};
