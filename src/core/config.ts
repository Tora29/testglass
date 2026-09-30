import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { InputAdapter, OutputAdapter } from "../adapters/types.js";
import { validateRulesConfig, type RulesConfig } from "../rules/config.js";

export interface TestglassConfig {
  /** 解析対象の glob（ルートからの相対） */
  include?: string[];
  exclude?: string[];
  /**
   * フレームワーク名 → そのアダプタで必ず解析するファイルの glob。
   * import 元による自動判定が外れるときに使う。例: { "playwright": ["e2e/**"] }
   */
  frameworks?: Record<string, string[]>;
  /** ルールID → "off" | "warn" | "error" */
  rules?: RulesConfig;
  /** spec.json の出力先（既定: "testglass/spec.json"） */
  out?: string;
  /** 成果物の出力先ディレクトリ（既定: spec.json と同じ場所） */
  outDir?: string;
  /** 出力形式（既定: ["html"]） */
  format?: string[];
  /** 出力アダプタごとのオプション（キーは出力アダプタの name） */
  outputOptions?: Record<string, unknown>;
  /** 追加の入力アダプタ（組み込みより先に判定される）。JS の設定ファイルでのみ指定できる */
  inputAdapters?: InputAdapter[];
  /** 追加の出力アダプタ。JS の設定ファイルでのみ指定できる */
  outputAdapters?: OutputAdapter[];
}

/** 設定ファイルで型補完を効かせるためのヘルパー */
export function defineConfig(config: TestglassConfig): TestglassConfig {
  return config;
}

export const CONFIG_FILES = ["testglass.config.mjs", "testglass.config.js", "testglass.config.json"];

/** 設定ファイルを読む。指定が無ければ dir から探し、見つからなければ空の設定を返す */
export async function loadConfig(dir: string, explicit?: string): Promise<{ config: TestglassConfig; path?: string }> {
  const path = explicit
    ? resolve(explicit)
    : CONFIG_FILES.map((f) => resolve(dir, f)).find((p) => existsSync(p));
  if (!path) return { config: {} };
  if (!existsSync(path)) throw new Error(`設定ファイルが見つかりません: ${path}`);

  let raw: unknown;
  if (path.endsWith(".json")) {
    raw = JSON.parse(await readFile(path, "utf8"));
  } else {
    const mod = (await import(pathToFileURL(path).href)) as { default?: unknown };
    raw = mod.default ?? mod;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`設定ファイルはオブジェクトを返してください: ${path}`);
  }
  const config = raw as TestglassConfig;
  try {
    validateRulesConfig(config.rules);
  } catch (e) {
    throw new Error(`${path}: ${(e as Error).message}`);
  }
  return { config, path };
}
