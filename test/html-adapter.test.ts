import { readFileSync } from "node:fs";
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
      { path: "x.test.ts", source: `import { it, expect } from "vitest";\nit("</script><img src=x onerror=alert(1)>", () => { expect(1).toBe(1); });` },
    ]).spec;
    const html = htmlAdapter.render(evil, { title: "<b>仕様書</b>" })[0]!.content;
    expect(html).not.toContain("</script><img");
    expect(html).toContain("<title>&#60;b&#62;仕様書&#60;/b&#62;</title>");
    const json = /id="testglass-data">([\s\S]*?)<\/script>/.exec(html)![1]!;
    expect(JSON.parse(json).spec.files[0].tests[0].title).toBe("</script><img src=x onerror=alert(1)>");
  });

  it("ファイル名とタイトルを指定できる", () => {
    const [file] = htmlAdapter.render(spec, { fileName: "review.html", title: "決済のテスト仕様書" });
    expect(file!.path).toBe("review.html");
    expect(file!.content).toContain("<title>決済のテスト仕様書</title>");
  });
});
