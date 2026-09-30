import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { beforeEach, describe, expect, it } from "vitest";
import { type Io, main } from "../src/cli/main.js";
import { type SpecJson, specJsonSchema } from "../src/index.js";

let cwd: string;
let out: string[];
let err: string[];
let io: Io;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "testglass-"));
  cpSync("test/fixtures", join(cwd, "project"), { recursive: true });
  out = [];
  err = [];
  io = { cwd, stdout: (t) => out.push(t), stderr: (t) => err.push(t) };
});

const readSpec = (path: string): SpecJson => JSON.parse(readFileSync(join(cwd, path), "utf8"));

describe("testglass（collect + render）", () => {
  it("fixtures から spec.json と HTML を生成する", async () => {
    expect(await main(["--root", "project"], io)).toBe(0);

    const spec = readSpec("testglass/spec.json");
    expect(spec.files.map((f) => f.path)).toEqual([
      "playwright/login.spec.ts",
      "playwright/weak.spec.ts",
      "vitest/cart.test.ts",
      "vitest/weak.test.ts",
    ]);
    const validate = new Ajv2020({ strict: true, validateFormats: false }).compile(specJsonSchema);
    expect(validate(spec), JSON.stringify(validate.errors)).toBe(true);

    const html = readFileSync(join(cwd, "testglass/spec.html"), "utf8");
    expect(html).toContain("正しいパスワードで成功する");
    expect(err.join("")).toContain("4 ファイル / 25 テストを解析しました");
  });

  it("毎回上書きし、同じ入力からは generatedAt 以外同じ内容になる", async () => {
    await main(["--root", "project"], io);
    const first = readSpec("testglass/spec.json");
    await main(["--root", "project"], io);
    const second = readSpec("testglass/spec.json");
    expect({ ...second, generatedAt: "" }).toEqual({ ...first, generatedAt: "" });
  });

  it("--fail-on error は error の警告があれば終了コード 1 を返す", async () => {
    expect(await main(["--root", "project", "--fail-on", "error"], io)).toBe(1);
    expect(await main(["--root", "project/playwright", "--out", "ok.json", "--fail-on", "error"], io)).toBe(1);
  });

  it("設定ファイルでルールを無効化し、frameworks で判定を上書きできる", async () => {
    writeFileSync(
      join(cwd, "project/testglass.config.json"),
      JSON.stringify({
        rules: { "no-assertions": "off", "focused-test": "off" },
        frameworks: { vitest: ["playwright/login.spec.ts"] },
      }),
    );
    await main(["collect", "--root", "project", "--out", "spec.json"], io);
    const spec = readSpec("spec.json");
    expect(spec.files.find((f) => f.path === "playwright/login.spec.ts")!.framework).toBe("vitest");
    const rules = spec.files.flatMap((f) => f.tests.flatMap((t) => t.warnings.map((w) => w.rule)));
    expect(rules).not.toContain("no-assertions");
    expect(rules).not.toContain("focused-test");
    expect(existsSync(join(cwd, "spec.html"))).toBe(false);
  });

  it("JS の設定ファイルで出力アダプタを追加できる", async () => {
    writeFileSync(
      join(cwd, "project/testglass.config.mjs"),
      `export default {
        format: ["html", "titles"],
        outputAdapters: [{
          name: "titles",
          render: (spec) => [{ path: "titles.txt", content: spec.files.flatMap((f) => f.tests.map((t) => t.title)).join("\\n") }],
        }],
      };`,
    );
    expect(await main(["--root", "project", "--out-dir", "report"], io)).toBe(0);
    expect(existsSync(join(cwd, "report/spec.html"))).toBe(true);
    expect(readFileSync(join(cwd, "report/titles.txt"), "utf8")).toContain("商品を追加すると合計金額が増える");
  });
});

describe("testglass render / schema", () => {
  it("render は spec.json から HTML を生成する", async () => {
    await main(["collect", "--root", "project", "--out", "a/spec.json"], io);
    expect(existsSync(join(cwd, "a/spec.html"))).toBe(false);
    expect(await main(["render", "a/spec.json", "--format", "html", "--out-dir", "b"], io)).toBe(0);
    expect(existsSync(join(cwd, "b/spec.html"))).toBe(true);
  });

  it("schema は JSON Schema を出力する", async () => {
    expect(await main(["schema"], io)).toBe(0);
    expect(JSON.parse(out.join(""))).toEqual(JSON.parse(JSON.stringify(specJsonSchema)));
  });
});

describe("エラー", () => {
  it("未知の出力形式・コマンド・オプションは終了コード 2", async () => {
    expect(await main(["--root", "project", "--format", "pdf"], io)).toBe(2);
    expect(err.join("")).toContain("未知の出力形式です: pdf（使える形式: html）");
    expect(await main(["publish"], io)).toBe(2);
    expect(await main(["--nope"], io)).toBe(2);
  });

  it("設定ファイルの未知のルールはエラーにする", async () => {
    writeFileSync(join(cwd, "project/testglass.config.json"), JSON.stringify({ rules: { typo: "off" } }));
    expect(await main(["--root", "project"], io)).toBe(2);
    expect(err.join("")).toContain('未知のルールです: "typo"');
  });

  it("schemaVersion が違う spec.json は読まない", async () => {
    writeFileSync(join(cwd, "old.json"), JSON.stringify({ schemaVersion: 99, files: [] }));
    expect(await main(["render", "old.json"], io)).toBe(2);
    expect(err.join("")).toContain("対応していない schemaVersion です: 99");
  });
});
