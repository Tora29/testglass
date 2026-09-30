import type { InputAdapter } from "../../adapters/types.js";
import { createTestCase } from "../../core/test-case.js";
import type { TestFile } from "../../schema/types.js";
import { extractAssertions, extractFixedWaits } from "./assertions.js";
import { createSource, dedentedText, positionOf, tokenize } from "./ast.js";
import { type DiscoveredTest, discoverTests, type JsProfile } from "./discover.js";

export interface JsAdapterDefinition {
  name: string;
  profile: JsProfile;
  match(filePath: string, source: string): boolean;
  /** 手順の抽出方法（フレームワークごとに差し替える） */
  steps(test: DiscoveredTest & { body: NonNullable<DiscoveredTest["body"]> }): string[];
}

export const JS_TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/i;

/** TypeScript Compiler API で JS/TS のテストを解析する入力アダプタを作る */
export function createJsAdapter(def: JsAdapterDefinition): InputAdapter {
  return {
    name: def.name,
    match: def.match,
    parse(filePath: string, source: string): TestFile {
      const sf = createSource(filePath, source);
      const tests = discoverTests(sf, def.profile).map((t) => {
        const body = t.body;
        return createTestCase({
          path: filePath,
          suites: t.suites,
          title: t.title,
          location: positionOf(t.call),
          modifiers: t.modifiers,
          steps: body ? def.steps({ ...t, body }) : [],
          source: dedentedText(t.call),
          assertions: body ? extractAssertions(body.body) : [],
          fixedWaits: body ? extractFixedWaits(body.body) : [],
          dynamic: t.dynamic,
          bodyResolved: !!body,
          normalizedBody: body ? tokenize(body) : undefined,
        });
      });
      return { path: filePath, framework: def.name, tests };
    },
  };
}

/** ソースが指定モジュールのいずれかを import / require しているか */
export function importsAny(source: string, modules: readonly string[]): boolean {
  return modules.some((m) => {
    const q = m.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    return new RegExp(`(?:from\\s*|import\\s*\\(?\\s*|require\\s*\\(\\s*)["']${q}["']`).test(source);
  });
}
