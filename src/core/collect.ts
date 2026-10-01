import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { glob } from "tinyglobby";
import type { InputAdapter } from "../adapters/types.js";
import { playwrightAdapter } from "../input/playwright.js";
import { vitestAdapter } from "../input/vitest.js";
import { applyRulesConfig, type RulesConfig } from "../rules/config.js";
import { applySpecRules } from "../rules/spec-rules.js";
import { SCHEMA_VERSION, type SpecJson, type TestFile } from "../schema/types.js";
import { TestglassError } from "./errors.js";

/** 組み込みの入力アダプタ（先に match したものが使われる） */
export const builtinInputAdapters: readonly InputAdapter[] = [playwrightAdapter, vitestAdapter];

export const DEFAULT_INCLUDE = ["**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"];
export const DEFAULT_EXCLUDE = ["**/node_modules/**", "**/dist/**", "**/build/**", "**/coverage/**", "**/.git/**"];

export interface SourceInput {
  /** ルートからの相対パス（"/" 区切り） */
  path: string;
  source: string;
}

export interface BuildOptions {
  adapters?: readonly InputAdapter[];
  rules?: RulesConfig;
  /** フレームワーク名 → そのアダプタで必ず解析するファイルのパス（自動判定より優先） */
  forced?: ReadonlyMap<string, string>;
  now?: Date;
}

export interface BuildResult {
  spec: SpecJson;
  /** どのアダプタにも match しなかったファイル */
  unmatched: string[];
}

/** ソースの一覧から spec.json を組み立てる（ファイルシステムには触れない） */
export function buildSpec(inputs: readonly SourceInput[], options: BuildOptions = {}): BuildResult {
  const adapters = options.adapters ?? builtinInputAdapters;
  const files: TestFile[] = [];
  const unmatched: string[] = [];

  for (const { path, source } of [...inputs].sort((a, b) => compare(a.path, b.path))) {
    const forcedName = options.forced?.get(path);
    const adapter = forcedName
      ? adapters.find((a) => a.name === forcedName)
      : adapters.find((a) => a.match(path, source));
    if (!adapter) {
      unmatched.push(path);
      continue;
    }
    files.push(adapter.parse(path, source));
  }

  const spec: SpecJson = {
    schemaVersion: SCHEMA_VERSION,
    generatedAt: formatLocalIso(options.now ?? new Date()),
    files,
  };
  applySpecRules(spec);
  applyRulesConfig(spec, options.rules ?? {});
  return { spec, unmatched };
}

export interface CollectOptions extends Omit<BuildOptions, "forced"> {
  /** 解析のルート。spec.json のパスはここからの相対パスになる */
  root: string;
  include?: readonly string[];
  exclude?: readonly string[];
  /** フレームワーク名 → そのアダプタで解析するファイルの glob */
  frameworks?: Readonly<Record<string, readonly string[]>>;
}

/** ルート配下のテストファイルを読み、spec.json を組み立てる */
export async function collect(options: CollectOptions): Promise<BuildResult> {
  const { root } = options;
  const exclude = [...(options.exclude ?? DEFAULT_EXCLUDE)];
  const paths = await glob([...(options.include ?? DEFAULT_INCLUDE)], { cwd: root, ignore: exclude, dot: false });

  const forced = new Map<string, string>();
  for (const [name, patterns] of Object.entries(options.frameworks ?? {})) {
    for (const p of await glob([...patterns], { cwd: root, ignore: exclude })) forced.set(p, name);
  }
  const adapters = options.adapters ?? builtinInputAdapters;
  for (const name of new Set(forced.values())) {
    if (!adapters.some((a) => a.name === name)) {
      throw new TestglassError({ code: "unknown-framework-adapter", name });
    }
  }

  const inputs = await Promise.all(
    paths.map(async (path) => ({ path, source: await readFile(join(root, path), "utf8") })),
  );
  return buildSpec(inputs, { ...options, adapters, forced });
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 2026-09-29T10:00:00+09:00 の形式（ローカルタイムゾーンのオフセット付き） */
export function formatLocalIso(date: Date): string {
  const pad = (n: number) => String(Math.abs(n)).padStart(2, "0");
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`
  );
}
