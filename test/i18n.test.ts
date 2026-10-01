import { describe, expect, it } from "vitest";
import { getMessages, LANGS } from "../src/i18n/index.js";
import { RULE_IDS } from "../src/rules/catalog.js";
import { warningMessage } from "../src/rules/messages.js";

/** 文言の {name} の一覧 */
const placeholders = (template: string) => [...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("辞書", () => {
  const ja = getMessages("ja");

  it.each(LANGS)("%s：すべてのルールに表示名・説明・理由・対処がある", (lang) => {
    const { rules } = getMessages(lang);
    expect(Object.keys(rules).sort()).toEqual([...RULE_IDS].sort());
    for (const text of Object.values(rules)) {
      expect(Object.values(text).every((s) => s.length > 0)).toBe(true);
    }
  });

  it.each(LANGS)("%s：Playwright の操作名は日本語と同じものをすべて訳している", (lang) => {
    expect(Object.keys(getMessages(lang).stepVerbs).sort()).toEqual(Object.keys(ja.stepVerbs).sort());
  });

  it.each(LANGS)("%s：HTML の文言の置き換え（{name}）が日本語とそろっている", (lang) => {
    const { html } = getMessages(lang);
    for (const key of ["ruleChipTitle", "openDetails", "jumpToLine"] as const) {
      expect(placeholders(html[key]), key).toEqual(placeholders(ja.html[key]));
    }
  });

  it.each(LANGS)("%s：CSV の列数と Markdown の表の列数が日本語と同じ", (lang) => {
    const t = getMessages(lang);
    expect(t.csv.header).toHaveLength(ja.csv.header.length);
    expect(t.markdown.caseHeader).toHaveLength(ja.markdown.caseHeader.length);
  });
});

describe("英語の警告の文言", () => {
  it("詳細から文言を組み立てる", () => {
    expect(warningMessage({ rule: "fixed-wait", severity: "warn", detail: { code: "sleep(1000)" } }, "en")).toBe(
      "Waits for a fixed time: sleep(1000)",
    );
    expect(warningMessage({ rule: "duplicate-title", severity: "warn", detail: { lines: [3, 9] } }, "en")).toBe(
      "2 tests in the same describe have the same name (lines 3, 9)",
    );
    const tests = [1, 2, 3, 4].map((line) => ({ path: "a.test.ts", title: `t${line}`, line }));
    expect(warningMessage({ rule: "duplicate-body", severity: "warn", detail: { tests } }, "en")).toBe(
      'Same body as "t1" (a.test.ts:1), "t2" (a.test.ts:2), "t3" (a.test.ts:3) and 1 more',
    );
  });

  it("言語を指定しなければ日本語", () => {
    expect(warningMessage({ rule: "snapshot-only", severity: "warn" })).toBe(
      "スナップショットの比較のみで検証している",
    );
  });
});
