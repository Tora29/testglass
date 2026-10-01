import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSpec } from "../src/core/collect.js";
import { csvAdapter } from "../src/output/csv.js";

const render = (files: { path: string; source: string }[], options?: Parameters<typeof csvAdapter.render>[1]) =>
  csvAdapter.render(buildSpec(files).spec, options)[0]!;

/** RFC 4180 の CSV を読む（検証用の最小実装） */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else cell += ch;
  }
  return rows;
}

describe("csvAdapter", () => {
  const weak = { path: "vitest/weak.test.ts", source: readFileSync("test/fixtures/vitest/weak.test.ts", "utf8") };

  it("BOM 付き・CRLF の spec.csv を出力する", () => {
    const file = render([weak]);
    expect(file.path).toBe("spec.csv");
    expect(file.content.startsWith("﻿項番,ファイル,")).toBe(true);
    expect(file.content.endsWith("\r\n")).toBe(true);
  });

  it("bom: false で BOM を付けず、ファイル名を指定できる", () => {
    const file = render([weak], { bom: false, fileName: "cases.csv" });
    expect(file.path).toBe("cases.csv");
    expect(file.content.startsWith("項番,")).toBe(true);
  });

  it('lang: "en" で列名・判定・修飾子を英語にする', () => {
    const rows = parseCsv(render([weak], { lang: "en", bom: false }).content);
    expect(rows[0]).toEqual([
      "No.",
      "File",
      "Framework",
      "describe",
      "Test",
      "Modifiers",
      "Steps",
      "Expected",
      "Verdict",
      "Issues",
      "Line",
    ]);
    expect(rows.slice(1).map((r) => r[8])).toContain("Needs review");
    expect(rows.slice(1).map((r) => r[5])).toContain("Skipped");
  });

  it("1 行 = 1 テストで、すべての行が同じ列数になる", () => {
    const spec = buildSpec([weak]).spec;
    const rows = parseCsv(render([weak], { bom: false }).content);
    expect(rows[0]).toEqual([
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
    ]);
    expect(rows).toHaveLength(spec.files[0]!.tests.length + 1);
    expect(new Set(rows.map((r) => r.length))).toEqual(new Set([11]));
  });

  it("手順・期待結果・指摘はセルの中で改行し、区切りや引用符を含む値は引用符で囲む", () => {
    const source = [
      `import { it, expect } from "vitest";`,
      `it("a, \\"b\\"", () => { const x = f(1, 2); expect(x).toBe("y"); expect(x).toBeTruthy(); });`,
    ].join("\n");
    const [, row] = parseCsv(render([{ path: "x.test.ts", source }], { bom: false }).content);
    expect(row![4]).toBe('a, "b"');
    expect(row![6]).toBe("1. const x = f(1, 2)");
    expect(row![7]).toBe('expect(x).toBe("y")\nexpect(x).toBeTruthy()');
    expect(row![10]).toBe("2");
  });

  it("表計算ソフトで数式として実行される値の先頭に ' を付ける", () => {
    const source = `import { it, expect } from "vitest";\nit("=HYPERLINK(\\"http://x\\")", () => { expect(1).toBe(1); });\nit("-1 を返す", () => { expect(1).toBe(1); });`;
    const rows = parseCsv(render([{ path: "x.test.ts", source }], { bom: false }).content);
    expect(rows[1]![4]).toBe(`'=HYPERLINK("http://x")`);
    expect(rows[2]![4]).toBe("'-1 を返す");
  });
});
