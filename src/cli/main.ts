import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { OutputAdapter } from "../adapters/types.js";
import { builtinInputAdapters, collect } from "../core/collect.js";
import { loadConfig, type TestglassConfig, validateLang } from "../core/config.js";
import { errorMessage, TestglassError } from "../core/errors.js";
import { DEFAULT_LANG, getMessages, type Lang } from "../i18n/index.js";
import { builtinOutputAdapters } from "../output/index.js";
import { specJsonSchema } from "../schema/json-schema.js";
import { SCHEMA_VERSION, type SpecJson } from "../schema/types.js";

export interface Io {
  cwd: string;
  stdout: (text: string) => void;
  stderr: (text: string) => void;
}

const DEFAULT_OUT = "testglass/spec.json";

/** 使い方の誤り（ヘルプへの案内を添える） */
class UsageError extends TestglassError {}

export async function main(argv: string[], io: Io = defaultIo()): Promise<number> {
  // メッセージの言語。--lang、設定の lang が分かった時点で切り替える（それまでは既定の日本語）
  const ctx: Context = { lang: DEFAULT_LANG };
  try {
    return await run(argv, io, ctx);
  } catch (e) {
    // 設定ファイルの誤りは、--lang が無ければ、そのファイルに書かれていた lang で表示する
    const lang = ctx.langOption ?? (e instanceof TestglassError ? e.lang : undefined) ?? ctx.lang;
    io.stderr(`testglass: ${errorMessage(e, lang)}\n`);
    if (e instanceof UsageError) io.stderr(`${getMessages(lang).cli.seeHelp}\n`);
    return 2;
  }
}

interface Context {
  /** 表示に使う言語 */
  lang: Lang;
  /** --lang で指定した言語 */
  langOption?: Lang;
}

async function run(argv: string[], io: Io, ctx: Context): Promise<number> {
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

  let lang: Lang | undefined;
  try {
    lang = validateLang(values.lang, "--lang");
  } catch (e) {
    throw e instanceof TestglassError ? new UsageError(e.detail) : e;
  }
  if (lang) ctx.lang = ctx.langOption = lang;

  if (values.help) {
    io.stdout(getMessages(ctx.lang).cli.help);
    return 0;
  }
  if (values.version) {
    io.stdout(`${await packageVersion()}\n`);
    return 0;
  }

  const [command = "all", ...rest] = positionals;
  const failOn = values["fail-on"];
  if (failOn !== undefined && failOn !== "error" && failOn !== "warn") {
    throw new UsageError({ code: "invalid-fail-on", value: failOn });
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
      if (rest.length) throw new UsageError({ code: "extra-args", args: rest });
      const root = resolve(io.cwd, str("root") ?? ".");
      const { config } = await loadConfig(root, str("config") && resolve(io.cwd, str("config")!));
      ctx.lang = lang ?? config.lang ?? DEFAULT_LANG;
      const specPath = resolve(io.cwd, str("out") ?? (config.out ? join(root, config.out) : DEFAULT_OUT));
      const spec = await runCollect(root, specPath, config, io, ctx.lang);
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
      if (!specArg) throw new UsageError({ code: "missing-spec-path" });
      if (extra.length) throw new UsageError({ code: "extra-args", args: extra });
      const specPath = resolve(io.cwd, specArg);
      const { config } = await loadConfig(io.cwd, str("config") && resolve(io.cwd, str("config")!));
      ctx.lang = lang ?? config.lang ?? DEFAULT_LANG;
      const spec = await readSpec(specPath);
      const outDir = resolve(io.cwd, str("out-dir") ?? dirname(specPath));
      await runRender(spec, outDir, formatsOf(str("format"), config), lang ?? config.lang, config, io);
      return exitCode(spec, failOn);
    }
    default:
      throw new UsageError({ code: "unknown-command", command });
  }
}

async function runCollect(
  root: string,
  specPath: string,
  config: TestglassConfig,
  io: Io,
  lang: Lang,
): Promise<SpecJson> {
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
  const { cli } = getMessages(lang);
  io.stderr(
    `${cli.collected({
      files: spec.files.length,
      tests: tests.length,
      path: rel(io, specPath),
      errors,
      warns: warnings.length - errors,
      testsWithWarnings: tests.filter((t) => t.warnings.length).length,
    })}\n`,
  );
  if (unmatched.length) io.stderr(`${cli.unmatched(unmatched)}\n`);
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
      throw new UsageError({ code: "unknown-format", format, formats: adapters.map((a) => a.name) });
    }
    // 言語は、すべての出力アダプタに共通のオプションとして渡す（--lang ＞ 設定の lang）
    const options = config.outputOptions?.[format];
    for (const file of adapter.render(spec, lang ? { ...(options as object | undefined), lang } : options)) {
      const path = resolve(outDir, file.path);
      await writeText(path, file.content);
      io.stderr(`${getMessages(lang ?? DEFAULT_LANG).cli.rendered(format, rel(io, path))}\n`);
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
    throw new TestglassError({ code: "unreadable-spec", path, reason: (e as Error).message });
  }
  if (spec?.schemaVersion !== SCHEMA_VERSION) {
    throw new TestglassError({ code: "unsupported-schema", version: spec?.schemaVersion, supported: SCHEMA_VERSION });
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
