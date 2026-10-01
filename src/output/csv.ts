import type { OutputAdapter } from "../adapters/types.js";
import { DEFAULT_LANG, getMessages, type Lang } from "../i18n/index.js";
import type { SpecJson } from "../schema/types.js";
import { reportCases, ruleLabel, stepLines, uniqueRules } from "./report.js";

export interface CsvOptions {
  /** 出力ファイル名（既定: "spec.csv"） */
  fileName?: string;
  /**
   * 先頭に BOM を付ける（既定: true）。
   * 付けないと、Excel でダブルクリックして開いたときに日本語が文字化けする。
   */
  bom?: boolean;
  /** 表示の言語（既定: "ja"） */
  lang?: Lang;
}

/**
 * 1 行 = 1 テストの CSV（RFC 4180）を出力する。表計算ソフトで絞り込み・並べ替えをする用途向け。
 * 手順・期待結果・指摘はセルの中で改行する。無いときは空のセルにする。
 */
export const csvAdapter: OutputAdapter<CsvOptions> = {
  name: "csv",
  render(spec: SpecJson, options: CsvOptions = {}) {
    const lang = options.lang ?? DEFAULT_LANG;
    const messages = getMessages(lang);
    const records: string[][] = [[...messages.csv.header]];
    for (const c of reportCases(spec).flat()) {
      const t = c.test;
      records.push([
        c.no,
        c.file.path,
        c.file.framework,
        t.suites.join(" / "),
        t.title,
        t.modifiers.map((m) => messages.modifiers[m]?.label ?? m).join(messages.csv.listSeparator),
        stepLines(t.steps, { lang }).join("\n"),
        t.assertions.map((a) => a.text).join("\n"),
        messages.verdicts[c.verdict],
        uniqueRules(t.warnings)
          .map((w) => ruleLabel(w.rule, lang))
          .join("\n"),
        String(t.location.line),
      ]);
    }
    const body = records.map((r) => r.map(field).join(",")).join("\r\n");
    return [{ path: options.fileName ?? "spec.csv", content: `${options.bom === false ? "" : "﻿"}${body}\r\n` }];
  },
};

/**
 * 1 つのセル。区切り・引用符・改行を含むときは引用符で囲む。
 * 表計算ソフトが数式として実行しないよう、= + - @ タブ CR で始まる値の先頭に ' を付ける（CSV インジェクション対策）。
 */
function field(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
