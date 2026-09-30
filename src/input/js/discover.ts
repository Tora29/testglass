import type { Modifier } from "../../schema/types.js";
import { MODIFIERS } from "../../schema/types.js";
import type { DynamicFact } from "../../rules/facts.js";
import { flattenChain, isFunctionLike, lineOf, stringValue, ts } from "./ast.js";

/** JS/TS 系フレームワークごとの差分。これを変えるだけで jest / bun test なども扱える。 */
export interface JsProfile {
  /** テスト関数として import される元モジュール */
  modules: readonly string[];
  /** import なし（globals）でも使える名前 */
  testNames: readonly string[];
  suiteNames: readonly string[];
  /** `test.describe` のように、テスト関数のプロパティとして持つ describe */
  suiteProperties: readonly string[];
  /** 宣言の連鎖に現れてよいプロパティ名と、対応する modifier（null は modifier なし） */
  chainProperties: Readonly<Record<string, Modifier | null>>;
}

export interface DiscoveredTest {
  suites: string[];
  title: string;
  call: ts.CallExpression;
  modifiers: Modifier[];
  /** テスト本体（関数参照や未指定なら undefined） */
  body: ts.ArrowFunction | ts.FunctionExpression | undefined;
  /** 本体として関数参照（識別子など）が渡されている */
  bodyIsReference: boolean;
  dynamic: DynamicFact[];
  /** `test` など、テストの宣言に使われた識別子（test.step の検出に使う） */
  testName: string;
}

interface Declaration {
  kind: "test" | "suite";
  modifiers: Modifier[];
  each: boolean;
  args: readonly ts.Expression[];
  testName: string;
}

interface Scope {
  suites: string[];
  modifiers: Modifier[];
  dynamic: DynamicFact[];
}

export function discoverTests(sf: ts.SourceFile, profile: JsProfile): DiscoveredTest[] {
  const names = collectNames(sf, profile);
  const tests: DiscoveredTest[] = [];

  const visit = (node: ts.Node, scope: Scope): void => {
    if (ts.isCallExpression(node)) {
      const decl = classify(node, names, profile);
      if (decl) {
        handleDeclaration(node, decl, scope);
        return;
      }
      if (isLoopCall(node)) {
        visit(node.expression, scope);
        const loopScope = withDynamic(scope, { reason: "loop", line: lineOf(node) });
        for (const arg of node.arguments) visit(arg, loopScope);
        return;
      }
    }
    if (isLoopStatement(node)) {
      const loopScope = withDynamic(scope, { reason: "loop", line: lineOf(node) });
      ts.forEachChild(node, (child) => visit(child, loopScope));
      return;
    }
    ts.forEachChild(node, (child) => visit(child, scope));
  };

  const handleDeclaration = (node: ts.CallExpression, decl: Declaration, scope: Scope): void => {
    const [titleArg, ...rest] = decl.args;
    const title = titleOf(titleArg);
    const dynamic = [...scope.dynamic];
    if (decl.each) dynamic.push({ reason: "each", line: lineOf(node) });
    if (title.dynamic) dynamic.push({ reason: "title", line: lineOf(node) });
    const modifiers = mergeModifiers(scope.modifiers, decl.modifiers, decl.each ? ["each"] : []);
    const fn = rest.find(isFunctionLike);

    if (decl.kind === "suite") {
      if (fn) visit(fn.body, { suites: [...scope.suites, title.text], modifiers, dynamic });
      return;
    }

    const bodyIsReference = !fn && rest.some((a) => ts.isIdentifier(a) || ts.isPropertyAccessExpression(a));
    if (bodyIsReference) dynamic.push({ reason: "body", line: lineOf(node) });
    // Vitest では本体の無い it('…') は todo として扱われる
    const implicitTodo = !fn && !bodyIsReference && !modifiers.includes("todo");
    tests.push({
      suites: scope.suites,
      title: title.text,
      call: node,
      modifiers: implicitTodo ? mergeModifiers(modifiers, ["todo"]) : modifiers,
      body: fn,
      bodyIsReference,
      dynamic,
      testName: decl.testName,
    });
  };

  visit(sf, { suites: [], modifiers: [], dynamic: [] });
  return tests;
}

interface Names {
  tests: Set<string>;
  suites: Set<string>;
}

/** import の別名や `base.extend()` で作られたテスト関数の名前も拾う */
function collectNames(sf: ts.SourceFile, profile: JsProfile): Names {
  const tests = new Set(profile.testNames);
  const suites = new Set(profile.suiteNames);

  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !ts.isStringLiteral(stmt.moduleSpecifier)) continue;
    if (!profile.modules.includes(stmt.moduleSpecifier.text)) continue;
    const bindings = stmt.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const el of bindings.elements) {
      const imported = (el.propertyName ?? el.name).text;
      if (profile.testNames.includes(imported)) tests.add(el.name.text);
      if (profile.suiteNames.includes(imported)) suites.add(el.name.text);
    }
  }

  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const init = node.initializer;
      if (ts.isCallExpression(init)) {
        const chain = flattenChain(init.expression);
        if (chain.root && tests.has(chain.root.text) && chain.names.at(-1) === "extend") {
          tests.add(node.name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return { tests, suites };
}

/** 呼び出しがテスト／describe の宣言なら、その内容を返す */
function classify(node: ts.CallExpression, names: Names, profile: JsProfile): Declaration | undefined {
  // it.each(table)('title', fn) / it.skipIf(cond)('title', fn) / test.each`table`('title', fn)
  let callee: ts.Expression = node.expression;
  let curried = false;
  if (ts.isCallExpression(callee) || ts.isTaggedTemplateExpression(callee)) {
    curried = true;
    callee = ts.isCallExpression(callee) ? callee.expression : callee.tag;
  }
  const chain = flattenChain(callee);
  if (!chain.root) return undefined;
  // 連鎖の途中に呼び出しを含むもの（curried 以外）は対象外
  if (!isPlainChain(callee)) return undefined;

  const rootName = chain.root.text;
  const isTestRoot = names.tests.has(rootName);
  const isSuiteRoot = names.suites.has(rootName);
  if (!isTestRoot && !isSuiteRoot) return undefined;

  let kind: Declaration["kind"] = isSuiteRoot ? "suite" : "test";
  const modifiers: Modifier[] = [];
  let each = false;
  for (const name of chain.names) {
    if (isTestRoot && kind === "test" && profile.suiteProperties.includes(name)) {
      kind = "suite";
      continue;
    }
    if (!(name in profile.chainProperties)) return undefined;
    const mod = profile.chainProperties[name];
    if (mod === "each") each = true;
    else if (mod) modifiers.push(mod);
  }
  // it.each(...) のように、テーブルを渡す呼び出しを経ていないものは宣言ではない
  if (each && !curried) return undefined;
  // test(...)(...) のような、プロパティを経ない二重呼び出しは宣言ではない
  if (curried && chain.names.length === 0) return undefined;

  const args = node.arguments;
  if (!isDeclarationArgs(args, kind)) return undefined;
  return { kind, modifiers, each, args, testName: rootName };
}

function isPlainChain(node: ts.Expression): boolean {
  let cur = node;
  while (ts.isPropertyAccessExpression(cur)) cur = cur.expression;
  return ts.isIdentifier(cur);
}

/**
 * `test.skip('title', fn)` は宣言、`test.skip(isMobile, 'reason')` や
 * `test.skip(({ browserName }) => …)` は実行時のスキップなので区別する。
 */
function isDeclarationArgs(args: readonly ts.Expression[], kind: Declaration["kind"]): boolean {
  const [first, ...rest] = args;
  if (!first || isFunctionLike(first)) return false;
  const hasFn = rest.some(isFunctionLike);
  if (kind === "suite") return hasFn;
  if (hasFn) return true;
  if (stringValue(first) === undefined && !ts.isTemplateExpression(first)) return false;
  // 本体に関数参照を渡す it('title', runCase) と、本体の無い it('title')（todo）
  return rest.every((a) => !ts.isStringLiteral(a));
}

function titleOf(node: ts.Expression | undefined): { text: string; dynamic: boolean } {
  const value = stringValue(node);
  if (value !== undefined) return { text: value, dynamic: false };
  if (!node) return { text: "", dynamic: true };
  if (ts.isTemplateExpression(node)) return { text: node.getText().slice(1, -1), dynamic: true };
  return { text: node.getText(), dynamic: true };
}

function mergeModifiers(...lists: Modifier[][]): Modifier[] {
  const set = new Set(lists.flat());
  return MODIFIERS.filter((m) => set.has(m));
}

function withDynamic(scope: Scope, fact: DynamicFact): Scope {
  return { ...scope, dynamic: [...scope.dynamic, fact] };
}

const LOOP_METHODS = new Set(["forEach", "map", "flatMap"]);

function isLoopCall(node: ts.CallExpression): boolean {
  return (
    ts.isPropertyAccessExpression(node.expression) &&
    LOOP_METHODS.has(node.expression.name.text) &&
    node.arguments.some(isFunctionLike)
  );
}

function isLoopStatement(node: ts.Node): boolean {
  return (
    ts.isForStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node)
  );
}
