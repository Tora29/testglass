/**
 * レポート・CLI の表示の言語。文言はすべてここの辞書から取り、spec.json には持たせない。
 * 言語を増やすときは、Messages を満たす辞書を1つ足して MESSAGES に登録する。
 */
import type { ErrorDetail } from "../core/errors.js";
import type { Verdict } from "../output/report.js";
import type { RuleId } from "../rules/catalog.js";
import type { Modifier, Warning } from "../schema/types.js";
import { en } from "./en.js";
import { ja } from "./ja.js";

export type Lang = "ja" | "en";

export const LANGS: readonly Lang[] = ["ja", "en"];

export const DEFAULT_LANG: Lang = "ja";

export function isLang(value: unknown): value is Lang {
  return LANGS.includes(value as Lang);
}

/** ルールの説明 */
export interface RuleText {
  /** 一覧に出す短い名前（指摘項目） */
  label: string;
  /** HTML のツールチップに出す説明 */
  description: string;
  /** なぜ問題なのか */
  why: string;
  /** どう直すか */
  fix: string;
}

/**
 * 1つの言語の辞書。
 * 文中に値を入れる文言は、{name} の形の置き換え（HTML 用。client.js で置き換える）か関数にする。
 */
export interface Messages {
  /** レポートの既定のタイトル */
  title: string;
  /** レポートの冒頭に添える注記 */
  staticAnalysis: string;
  verdicts: Record<Verdict, string>;
  modifiers: Record<Modifier, { label: string; title: string }>;
  /** Playwright の操作名 → 表示 */
  stepVerbs: Readonly<Record<string, string>>;
  /** モックの設定（手順の「mock: …」）の表示 */
  mock: { label: string; title: string };
  /** 期待結果が無いときの表示（.todo は todo、それ以外は none） */
  noAssertions: { todo: string; none: string };
  rules: Record<RuleId, RuleText>;
  /** 警告の文言（ルールID と detail から組み立てる） */
  warning: (warning: Warning) => string;
  markdown: {
    /** 指摘の一覧の見出し */
    issues: string;
    issuesHeader: readonly [verdict: string, issue: string, count: string];
    caseHeader: readonly [no: string, title: string, steps: string, expected: string, verdict: string];
    noTests: string;
    /** describe の外にあるテストの見出し */
    outsideDescribe: string;
    /** テスト名の前に付ける修飾子 */
    modifier: (label: string) => string;
  };
  csv: {
    header: readonly string[];
    /** 1つのセルに複数の修飾子を並べるときの区切り */
    listSeparator: string;
  };
  /** HTML の画面の文言（client.js に埋め込みデータで渡す） */
  html: {
    filterByVerdict: string;
    filterByFramework: string;
    filterByRule: string;
    search: string;
    searchLabel: string;
    expandAll: string;
    collapseAll: string;
    switchTheme: string;
    themes: { auto: string; light: string; dark: string };
    all: string;
    noIssues: string;
    /** {description}・{id} を置き換える */
    ruleChipTitle: string;
    /** {no} を置き換える */
    openDetails: string;
    columns: { no: string; title: string; steps: string; expected: string; verdict: string };
    /** {line} を置き換える */
    jumpToLine: string;
    issues: string;
    why: string;
    fix: string;
    source: string;
    assertLine: string;
    warnLine: string;
    noTests: string;
    noResults: string;
    clearFilters: string;
  };
  /** CLI の表示 */
  cli: {
    help: string;
    /** 使い方の誤りのあとに添える案内 */
    seeHelp: string;
    collected: (summary: {
      files: number;
      tests: number;
      path: string;
      errors: number;
      warns: number;
      testsWithWarnings: number;
    }) => string;
    /** どの入力アダプタにも該当しなかったファイル */
    unmatched: (paths: readonly string[]) => string;
    rendered: (format: string, path: string) => string;
  };
  /** エラーの文言（src/core/errors.ts） */
  errors: (detail: ErrorDetail) => string;
}

const MESSAGES: Record<Lang, Messages> = { ja, en };

export function getMessages(lang: Lang = DEFAULT_LANG): Messages {
  return MESSAGES[lang];
}
