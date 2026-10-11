import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { buildSpec } from "../src/core/collect.js";
import { htmlAdapter } from "../src/output/html/index.js";

const source = readFileSync("test/fixtures/vitest/cart.test.ts", "utf8");

describe("htmlAdapter", () => {
  const { spec } = buildSpec([{ path: "vitest/cart.test.ts", source }], { now: new Date("2026-09-29T01:00:00Z") });

  it("単一の HTML ファイルを出力する", () => {
    const files = htmlAdapter.render(spec);
    expect(files.map((f) => f.path)).toEqual(["spec.html"]);
    expect(files[0]!.content.startsWith("<!doctype html>")).toBe(true);
  });

  it("CSS・JS・データを埋め込み、外部リソースを読み込まない", () => {
    const html = htmlAdapter.render(spec)[0]!.content;
    expect(html).toContain("<style>");
    expect(html).toContain('<script type="application/json" id="testglass-data">');
    expect(html).not.toMatch(/<(script|link|img)[^>]+(src|href)=/i);
  });

  it("埋め込んだデータから spec を復元できる", () => {
    const html = htmlAdapter.render(spec)[0]!.content;
    const json = /<script type="application\/json" id="testglass-data">([\s\S]*?)<\/script>/.exec(html)![1]!;
    expect(JSON.parse(json).spec).toEqual(spec);
  });

  it("テスト名に </script> や HTML が含まれても、埋め込みが壊れない", () => {
    const evil = buildSpec([
      {
        path: "x.test.ts",
        source: `import { it, expect } from "vitest";\nit("</script><img src=x onerror=alert(1)>", () => { expect(1).toBe(1); });`,
      },
    ]).spec;
    const html = htmlAdapter.render(evil, { title: "<b>仕様書</b>" })[0]!.content;
    expect(html).not.toContain("</script><img");
    expect(html).toContain("<title>&#60;b&#62;仕様書&#60;/b&#62;</title>");
    const json = /id="testglass-data">([\s\S]*?)<\/script>/.exec(html)![1]!;
    expect(JSON.parse(json).spec.files[0].tests[0].title).toBe("</script><img src=x onerror=alert(1)>");
  });

  it('既定は日本語で、lang: "en" で英語の画面にする', () => {
    const payloadOf = (html: string) => JSON.parse(/id="testglass-data">([\s\S]*?)<\/script>/.exec(html)![1]!);
    const ja = htmlAdapter.render(spec)[0]!.content;
    expect(ja).toContain('<html lang="ja">');
    expect(ja).toContain("<title>テスト仕様書</title>");
    expect(payloadOf(ja).labels.verdicts.error).toBe("要修正");

    const en = htmlAdapter.render(spec, { lang: "en" })[0]!.content;
    expect(en).toContain('<html lang="en">');
    expect(en).toContain("<title>Test specification</title>");
    expect(en).toContain('placeholder="Search"');
    const payload = payloadOf(en);
    expect(payload.labels.verdicts.error).toBe("Needs fix");
    expect(payload.labels.ui.columns.expected).toBe("Expected");
    expect(payload.rules.find((r: { id: string }) => r.id === "no-assertions").label).toBe("No expect");
    // 手順の表示名と警告の文言も英語になる（spec はそのまま）
    expect(JSON.stringify(payload.cases)).not.toMatch(/[ぁ-んァ-ヶ]/);
    expect(payload.spec).toEqual(spec);
  });

  it("ファイル名とタイトルを指定できる", () => {
    const [file] = htmlAdapter.render(spec, { fileName: "review.html", title: "決済のテスト仕様書" });
    expect(file!.path).toBe("review.html");
    expect(file!.content).toContain("<title>決済のテスト仕様書</title>");
  });
});

describe("client.js（#t-<id> で開く）", () => {
  // DOM 全体は用意せず、openFromHash だけを取り出して、location と表の行を差し替えて動かす
  const client = readFileSync("src/output/html/assets/client.js", "utf8");
  const openFromHash = /\n {2}function openFromHash\(\) \{\n[\s\S]*?\n {2}\}\n/.exec(client)?.[0];
  const open = (hash: string) => {
    const opened: string[] = [];
    const rows = ["t-a", "t-é"].map((id) => ({
      entry: { test: { id: id.slice(2) } },
      c: { tr: { hidden: true, scrollIntoView() {} }, setOpen: () => opened.push(id) },
    }));
    runInNewContext(`${openFromHash}\nopenFromHash();`, { location: { hash }, rows });
    return opened;
  };

  it("id をデコードして、そのテストを開く", () => {
    expect(openFromHash).toBeDefined();
    expect(open("#t-a")).toEqual(["t-a"]);
    expect(open("#t-%C3%A9")).toEqual(["t-é"]);
    expect(open("")).toEqual([]);
  });

  it("壊れたエンコードの # でも例外を投げない", () => {
    expect(open("#t-%E0%A4%A")).toEqual([]);
    expect(open("#%")).toEqual([]);
  });
});
