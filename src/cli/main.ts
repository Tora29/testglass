import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { OutputAdapter } from "../adapters/types.js";
import { builtinInputAdapters, collect } from "../core/collect.js";
import { loadConfig, type TestglassConfig, validateLang } from "../core/config.js";
import type { Lang } from "../i18n/index.js";
import { builtinOutputAdapters } from "../output/index.js";
import { specJsonSchema } from "../schema/json-schema.js";
import { SCHEMA_VERSION, type SpecJson } from "../schema/types.js";

export interface Io {
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const DEFAULT_OUT = "testglass/spec.json";

const HELP = `testglass — テストコードからレビュー用のテスト仕様書を作る

使い方:
  testglass [options]                   テストを読んで spec.json と成果物（HTML）をまとめて生成
  testglass collect [options]           テストを読んで spec.json を上書き
  testglass render <spec.json> [opts]   spec.json から成果物を生成
  testglass schema [--out <file>]       spec.json の JSON Schema を出力

オプション:
  --root <dir>        解析するルートディレクトリ（既定: カレントディレクトリ）
  --out <file>        spec.json の出力先（既定: ${DEFAULT_OUT}）
  --format <names>    出力形式（html / md / csv をカンマ区切り。既定: html）
  --out-dir <dir>     成果物の出力先（既定: spec.json と同じディレクトリ）
  --lang <lang>       成果物の言語（ja / en。既定: ja）
  --config <file>     設定ファイル（既定: ルートの testglass.config.{mjs,js,json}）
  --fail-on <level>   error / warn の警告が1件でもあれば終了コード 1 を返す
  -h, --help          このヘルプを表示
  -v, --version       バージョンを表示
`;

class UsageError extends Error {}

export async function main(argv: string[], io: Io = defaultIo()): Promise<number> {
  try {
    return await run(argv, io);
  } catch (e) {
    io.stderr(`testglass: ${(e as Error).message}\n`);
    if (e instanceof UsageError) io.stderr(`\`testglass --help\` で使い方を確認できます。\n`);
    return 2;
  }
}

async function run(argv: string[], io: Io): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: true,
    options: {
      root: { type: "string" },
      out: { type: "string" },
      format: { type: "string" },
      "out-dir": { type: "string" },
      config: { type: "string" },
      "fail-on": { type: "string" },
      lang: { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });

  if (values.help) {
    io.stdout(HELP);
    return 0;
  }
  if (values.version) {
    io.stdout(`${await packageVersion()}\n`);
    return 0;
  }

  const [command = "all", ...rest] = positionals;
  const failOn = values["fail-on"];
  if (failOn !== undefined && failOn !== "error" && failOn !== "warn") {
    throw new UsageError(`--fail-on には error か warn を指定してください（指定値: ${failOn}）`);
  }
  let lang: Lang | undefined;
  try {
    lang = validateLang(values.lang, "--lang");
  } catch (e) {
    throw new UsageError((e as Error).message);
  }
  const str = (k: "root" | "out" | "format" | "out-dir" | "config") => values[k];

  switch (command) {
    case "schema": {
      const text = `${JSON.stringify(specJsonSchema, null, 2)}\n`;
      const out = str("out");
      if (out) await writeText(resolve(io.cwd, out), text);
      else io.stdout(text);
      return 0;
    }
    case "collect":
    case "all": {
      if (rest.length) throw new UsageError(`余分な引数があります: ${rest.join(" ")}`);
      const root = resolve(io.cwd, str("root") ?? ".");
      const { config } = await loadConfig(root, str("config") && resolve(io.cwd, str("config")!));
      const specPath = resolve(io.cwd, str("out") ?? (config.out ? join(root, config.out) : DEFAULT_OUT));
      const spec = await runCollect(root, specPath, config, io);
      if (command === "all") {
        const outDir = resolve(
          io.cwd,
          str("out-dir") ?? (config.outDir ? join(root, config.outDir) : dirname(specPath)),
        );
        await runRender(spec, outDir, formatsOf(str("format"), config), lang ?? config.lang, config, io);
      }
      return exitCode(spec, failOn);
    }
    case "render": {
      const [specArg, ...extra] = rest;
      if (!specArg) throw new UsageError("render には spec.json のパスを指定してください");
      if (extra.length) throw new UsageError(`余分な引数があります: ${extra.join(" ")}`);
      const specPath = resolve(io.cwd, specArg);
      const { config } = await loadConfig(io.cwd, str("config") && resolve(io.cwd, str("config")!));
      const spec = await readSpec(specPath);
      const outDir = resolve(io.cwd, str("out-dir") ?? dirname(specPath));
      await runRender(spec, outDir, formatsOf(str("format"), config), lang ?? config.lang, config, io);
      return exitCode(spec, failOn);
    }
    default:
      throw new UsageError(`未知のコマンドです: ${command}`);
  }
}

async function runCollect(root: string, specPath: string, config: TestglassConfig, io: Io): Promise<SpecJson> {
  const { spec, unmatched } = await collect({
    root,
    include: config.include,
    exclude: config.exclude,
    frameworks: config.frameworks,
    rules: config.rules,
    adapters: [...(config.inputAdapters ?? []), ...builtinInputAdapters],
  });
  await writeText(specPath, `${JSON.stringify(spec, null, 2)}\n`);

  const tests = spec.files.flatMap((f) => f.tests);
  const warnings = tests.flatMap((t) => t.warnings);
  const errors = warnings.filter((w) => w.severity === "error").length;
  io.stderr(
    `✔ ${spec.files.length} ファイル / ${tests.length} テストを解析しました → ${rel(io, specPath)}\n` +
      `  警告: error ${errors} 件 / warn ${warnings.length - errors} 件（警告のあるテスト ${tests.filter((t) => t.warnings.length).length} 件）\n`,
  );
  if (unmatched.length) {
    io.stderr(
      `  どの入力アダプタにも該当しなかったファイル（${unmatched.length} 件）:\n` +
        unmatched.map((p) => `    - ${p}\n`).join("") +
        `  自動判定が外れている場合は、設定ファイルの frameworks で指定してください。\n`,
    );
  }
  return spec;
}

async function runRender(
  spec: SpecJson,
  outDir: string,
  formats: string[],
  lang: Lang | undefined,
  config: TestglassConfig,
  io: Io,
): Promise<void> {
  const adapters: OutputAdapter[] = [...(config.outputAdapters ?? []), ...builtinOutputAdapters];
  for (const format of formats) {
    const adapter = adapters.find((a) => a.name === format);
    if (!adapter) {
      throw new UsageError(`未知の出力形式です: ${format}（使える形式: ${adapters.map((a) => a.name).join(", ")}）`);
    }
    // 言語は、すべての出力アダプタに共通のオプションとして渡す（--lang ＞ 設定の lang）
    const options = config.outputOptions?.[format];
    for (const file of adapter.render(spec, lang ? { ...(options as object | undefined), lang } : options)) {
      const path = resolve(outDir, file.path);
      await writeText(path, file.content);
      io.stderr(`✔ ${format} を出力しました → ${rel(io, path)}\n`);
    }
  }
}

function formatsOf(arg: string | undefined, config: TestglassConfig): string[] {
  const list = arg ? arg.split(",") : (config.format ?? ["html"]);
  return list.map((s) => s.trim()).filter(Boolean);
}

async function readSpec(path: string): Promise<SpecJson> {
  let spec: SpecJson;
  try {
    spec = JSON.parse(await readFile(path, "utf8")) as SpecJson;
  } catch (e) {
    throw new Error(`spec.json を読めません: ${path}（${(e as Error).message}）`);
  }
  if (spec?.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `対応していない schemaVersion です: ${String(spec?.schemaVersion)}（このバージョンは ${SCHEMA_VERSION} に対応）`,
    );
  }
  return spec;
}

function exitCode(spec: SpecJson, failOn: string | undefined): number {
  if (!failOn) return 0;
  const hit = spec.files.some((f) =>
    f.tests.some((t) => t.warnings.some((w) => failOn === "warn" || w.severity === "error")),
  );
  return hit ? 1 : 0;
}

async function writeText(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
}

function rel(io: Io, path: string): string {
  const r = relative(io.cwd, path);
  return r.startsWith("..") ? path : r;
}

async function packageVersion(): Promise<string> {
  const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };
  return pkg.version;
}

function defaultIo(): Io {
  return {
    cwd: process.cwd(),
    stdout: (t) => process.stdout.write(t),
    stderr: (t) => process.stderr.write(t),
  };
}
