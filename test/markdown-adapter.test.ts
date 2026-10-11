import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSpec } from "../src/core/collect.js";
import { markdownAdapter } from "../src/output/markdown.js";
import type { SpecJson, TestCase } from "../src/schema/types.js";

const now = new Date("2026-09-29T01:00:00Z");
const emptyTest: TestCase = {
  id: "x",
  suites: [],
  title: "t",
  location: { line: 1, column: 1 },
  modifiers: [],
  steps: [],
  assertions: [],
  warnings: [],
  source: "",
};
const render = (files: { path: string; source: string }[], options?: Parameters<typeof markdownAdapter.render>[1]) =>
  markdownAdapter.render(buildSpec(files, { now }).spec, options)[0]!;

describe("markdownAdapter", () => {
  const cart = { path: "vitest/cart.test.ts", source: readFileSync("test/fixtures/vitest/cart.test.ts", "utf8") };
  const weak = { path: "vitest/weak.test.ts", source: readFileSync("test/fixtures/vitest/weak.test.ts", "utf8") };

  it("spec.md を 1 つ出力し、ファイル名とタイトルを指定できる", () => {
    expect(render([cart]).path).toBe("spec.md");
    const file = render([cart], { fileName: "review.md", title: "決済のテスト仕様書" });
    expect(file.path).toBe("review.md");
    expect(file.content.startsWith("# 決済のテスト仕様書\n")).toBe(true);
  });

  it("ファイルごとに見出しを立て、describe ごとに「項番／テスト名／手順／期待結果／判定」の表を並べる", () => {
    const md = render([cart]).content;
    expect(md).toContain("## `vitest/cart.test.ts`");
    expect(md).toContain("### Cart / add");
    expect(md).toContain("| 項番 | テスト名 | 手順 | 期待結果 | 判定 |");
    expect(md).toMatch(
      /^\| 1-1 \| 商品を追加すると合計金額が増える \| 1\. `cart\.add\(.*\)` \| `expect\(cart\.total\)\.toBe\(200\)`<br>/m,
    );
  });

  it("指摘の一覧と、各テストの判定・指摘を書く", () => {
    const md = render([weak]).content;
    expect(md).toContain("## 指摘");
    expect(md).toMatch(/^\| 要修正 \| expect がない \| \d+ \|$/m);
    expect(md).toMatch(/\| 要修正<br>expect がない(<br>|\s\|)/);
  });

  it("修飾子と、期待結果が無いときの表示を HTML と揃える", () => {
    const md = render([
      {
        path: "x.test.ts",
        source: `import { it, expect } from "vitest";\nit.skip("s", () => { expect(1).toBe(1); });\nit.todo("t");\nit("n", () => { run(); });`,
      },
    ]).content;
    expect(md).toContain("| ［スキップ］ s |");
    expect(md).toMatch(/\| ［未実装］ t \| — \| 未実装 \|/);
    expect(md).toMatch(/\| n \| 1\. `run\(\)` \| なし \|/);
  });

  it("テスト名やコードに含まれる Markdown の記号・HTML で表が崩れない", () => {
    const md = render([
      {
        path: "x.test.ts",
        source: [
          `import { it, expect } from "vitest";`,
          'it("a | b <script>alert(1)</script> *強調* $x$", () => { expect(`a|b`).toBe("`"); });',
        ].join("\n"),
      },
    ]).content;
    const row = md.split("\n").find((l) => l.startsWith("| 1-1 "))!;
    expect(row).toContain("a \\| b &lt;script&gt;alert(1)&lt;/script&gt; \\*強調\\* \\$x\\$");
    expect(row).not.toContain("<script>");
    // コードの中の | はエスケープし、バッククォートはより長い区切りで囲む
    expect(row).toContain('``expect(`a\\|b`).toBe("`")``');
    // セルの区切りは 5 列 + 両端の 6 本だけ（エスケープしていない | を数える）
    expect(row.match(/(?<!\\)\|/g)).toHaveLength(6);
  });

  it('lang: "en" で見出し・表・判定を英語にする', () => {
    const md = render([weak], { lang: "en" }).content;
    expect(md.startsWith("# Test specification\n")).toBe(true);
    expect(md).toContain("Static analysis (tests were not run)");
    expect(md).toContain("## Issues");
    expect(md).toContain("| Verdict | Issue | Count |");
    expect(md).toContain("| No. | Test | Steps | Expected | Verdict |");
    expect(md).toContain("Needs fix<br>No expect");
  });

  describe("外部の spec.json（render で読むもの）の値も、Markdown・HTML として解釈されないように書く", () => {
    const testCase = (over: Partial<TestCase> = {}): TestCase => ({ ...emptyTest, ...over });
    const spec = (over: Partial<SpecJson> = {}, file: Partial<SpecJson["files"][number]> = {}): SpecJson => ({
      schemaVersion: 1,
      generatedAt: "2026-09-29T10:00:00+09:00",
      files: [{ path: "a.test.ts", framework: "vitest", tests: [testCase()], ...file }],
      ...over,
    });
    const md = (s: SpecJson) => markdownAdapter.render(s)[0]!.content;

    it("フレームワーク名", () => {
      const out = md(spec({}, { framework: "<img src=x onerror=alert(1)> | [x](javascript:alert(1))" }));
      expect(out).toContain("&lt;img src=x onerror=alert(1)&gt; \\| \\[x\\](javascript:alert(1)) · 1 tests");
      expect(out).not.toContain("<img");
    });

    it("日時として読めない generatedAt", () => {
      const out = md(spec({ generatedAt: "<script>alert(1)</script>\n# 見出し" }));
      expect(out).toContain("&lt;script&gt;alert(1)&lt;/script&gt; \\# 見出し · 1 files");
      expect(out).not.toContain("<script>");
      expect(out).not.toMatch(/^# 見出し/m);
    });

    it("未知の修飾子", () => {
      const modifiers = ["<b>x</b>|y"] as unknown as TestCase["modifiers"];
      const out = md(spec({}, { tests: [testCase({ modifiers })] }));
      const row = out.split("\n").find((l) => l.startsWith("| 1-1 "))!;
      expect(row).toContain("［&lt;b&gt;x&lt;/b&gt;\\|y］ t");
      expect(row.match(/(?<!\\)\|/g)).toHaveLength(6);
    });
  });

  it("改行を含む空白の並びだけを空白 1 つにする（\\r\\n・タブ・NBSP なども空白として扱う）", () => {
    const titleCell = (title: string) =>
      markdownAdapter
        .render({
          schemaVersion: 1,
          generatedAt: "2026-09-29T10:00:00+09:00",
          files: [{ path: "a.test.ts", framework: "vitest", tests: [{ ...emptyTest, title }] }],
        })[0]!
        .content.split("\n")
        .find((l) => l.startsWith("| 1-1 "))!
        .split(" | ")[1];
    expect(titleCell("a \t\r\n\f\u00a0 b")).toBe("a b");
    expect(titleCell("a\r\n\r\nb\nc")).toBe("a b c");
    expect(titleCell("a \t\u00a0b")).toBe("a \t\u00a0b");
    expect(titleCell("a\rb\u2028c")).toBe("a\rb\u2028c");
  });

  it("改行の無い長い空白でもすぐに終わる", () => {
    // 以前の /\s*\r?\n\s*/g では、80,000 文字の空白で約3秒かかっていた
    const title = `a${" ".repeat(80000)}b`;
    const start = performance.now();
    const out = markdownAdapter.render({
      schemaVersion: 1,
      generatedAt: "2026-09-29T10:00:00+09:00",
      files: [{ path: "a.test.ts", framework: "vitest", tests: [{ ...emptyTest, title, source: title }] }],
    })[0]!.content;
    expect(performance.now() - start).toBeLessThan(200);
    expect(out).toContain(title);
  });

  it("テストの無いファイルは、その旨を書く", () => {
    const md = render([{ path: "empty.test.ts", source: `import { it } from "vitest";` }]).content;
    expect(md).toContain("## `empty.test.ts`\n\nvitest · 0 tests\n\nテストが見つからない");
  });
});
