import type { AssertionFact, AssertionKind, CodeRef } from "../../rules/facts.js";
import { collapse, flattenChain, lineOf, ts, unwrap, walk } from "./ast.js";

const EXPECT_ENTRY = new Set(["soft", "poll"]);
/** expect.xxx(…) のうち、検証そのものではないもの */
const EXPECT_META = new Set(["assertions", "hasAssertions", "extend", "addSnapshotSerializer", "configure"]);

const SNAPSHOT = new Set([
  "toMatchSnapshot",
  "toMatchInlineSnapshot",
  "toMatchFileSnapshot",
  "toThrowErrorMatchingSnapshot",
  "toThrowErrorMatchingInlineSnapshot",
  "toHaveScreenshot",
  "toMatchAriaSnapshot",
]);
const MOCK_CALL = /^to(HaveBeen|Be)(Last|Nth)?Called|^toHave(Been)?(Last|Nth)?(Returned|Resolved)|^toReturn/;
const TRUTHY = new Set(["toBeTruthy", "toBeFalsy", "toBeDefined"]);
const TRUTHY_NEGATED = new Set(["toBeUndefined", "toBeNull"]);
const CHAI_TRUTHY = new Set(["ok", "exist", "exists"]);
const ASSERT_TRUTHY = new Set(["ok", "exists", "isOk", "isDefined", "isNotNull", "isNotUndefined"]);
const HELPER = /^(expect|assert|verify)[A-Z0-9_]/;

/** 連鎖の途中（さらに外側へ続く）ノードなら true */
function isInnerChainNode(node: ts.Node): boolean {
  const parent = node.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && parent.expression === node) ||
    (ts.isCallExpression(parent) && parent.expression === node) ||
    (ts.isElementAccessExpression(parent) && parent.expression === node)
  );
}

/** expect(x) / expect.soft(x) / expect.poll(fn) の呼び出しか */
function isExpectSubject(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return callee.text === "expect";
  return (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === "expect" &&
    EXPECT_ENTRY.has(callee.name.text)
  );
}

/** 連鎖の中に expect(…) の呼び出しを含んでいれば返す */
function findExpectSubject(node: ts.Expression): ts.CallExpression | undefined {
  let cur: ts.Expression = node;
  for (;;) {
    if (isExpectSubject(cur)) return cur;
    if (ts.isCallExpression(cur) || ts.isPropertyAccessExpression(cur) || ts.isElementAccessExpression(cur)) {
      cur = cur.expression;
    } else return undefined;
  }
}

interface Classified {
  kind: AssertionKind;
}

/** アサーションの連鎖の最も外側のノードなら分類を返す */
export function classifyAssertion(node: ts.Node): Classified | undefined {
  if (!(ts.isCallExpression(node) || ts.isPropertyAccessExpression(node))) return undefined;
  if (isInnerChainNode(node)) return undefined;

  const subject = findExpectSubject(node);
  if (subject) {
    if (subject === node) return undefined; // matcher の無い expect(x)
    const { names } = flattenChain(node);
    const after = names.slice(names.lastIndexOf(subjectLastName(subject)) + 1);
    const matcher = after.at(-1) ?? "";
    const negated = after.includes("not");
    return { kind: kindOfMatcher(matcher, negated) };
  }

  if (ts.isCallExpression(node)) {
    const chain = flattenChain(node.expression);
    const root = chain.root?.text;
    if (root === "expect" && chain.names.length === 1 && EXPECT_META.has(chain.names[0]!)) return undefined;
    if (root === "assert") {
      const method = chain.names.at(-1);
      if (chain.names.length === 0 || (method && ASSERT_TRUTHY.has(method))) return { kind: "truthiness" };
      return { kind: "value" };
    }
    if (root && chain.names.length === 0 && HELPER.test(root)) return { kind: "helper" };
  }
  return undefined;
}

/** expect.soft(x) の "soft" のように、subject の呼び出しに含まれるプロパティ名 */
function subjectLastName(subject: ts.CallExpression): string {
  return ts.isPropertyAccessExpression(subject.expression) ? subject.expression.name.text : "\u0000";
}

function kindOfMatcher(matcher: string, negated: boolean): AssertionKind {
  if (SNAPSHOT.has(matcher)) return "snapshot";
  if (MOCK_CALL.test(matcher)) return "mock-call";
  if (TRUTHY.has(matcher) || CHAI_TRUTHY.has(matcher)) return "truthiness";
  if (negated && TRUTHY_NEGATED.has(matcher)) return "truthiness";
  return "value";
}

/** 本体の中のアサーションをすべて集める（ネストした関数の中も含む） */
export function extractAssertions(body: ts.Node): AssertionFact[] {
  const found: AssertionFact[] = [];
  walk(body, (node) => {
    const classified = classifyAssertion(node);
    if (!classified) return;
    found.push({
      line: lineOf(node),
      text: collapse(node.getText()),
      kind: classified.kind,
      conditional: isConditional(node, body),
    });
    return false;
  });
  return found;
}

/** 文がアサーションだけから成るか（手順から除外するため） */
export function isAssertionStatement(stmt: ts.Statement): boolean {
  return ts.isExpressionStatement(stmt) && isAssertionExpression(stmt.expression);
}

export function isAssertionExpression(node: ts.Expression): boolean {
  const expr = unwrap(node);
  if (classifyAssertion(expr)) return true;
  // expect.assertions(1) なども手順には含めない
  if (ts.isCallExpression(expr)) {
    const chain = flattenChain(expr.expression);
    return chain.root?.text === "expect" && chain.names.length === 1 && EXPECT_META.has(chain.names[0]!);
  }
  return false;
}

/** 実行されない可能性のある位置（if / 三項 / && / switch / catch）にあるか */
function isConditional(node: ts.Node, stop: ts.Node): boolean {
  let child: ts.Node = node;
  for (let cur = node.parent; cur && cur !== stop; child = cur, cur = cur.parent) {
    if (ts.isIfStatement(cur) && cur.expression !== child) return true;
    if (ts.isConditionalExpression(cur) && cur.condition !== child) return true;
    if (ts.isCaseClause(cur) || ts.isDefaultClause(cur) || ts.isCatchClause(cur)) return true;
    if (
      ts.isBinaryExpression(cur) &&
      cur.right === child &&
      [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(
        cur.operatorToken.kind,
      )
    ) {
      return true;
    }
  }
  return false;
}

const SLEEP_NAMES = new Set(["sleep", "delay", "wait", "pause"]);

/** 固定時間の待ちを集める */
export function extractFixedWaits(body: ts.Node): CodeRef[] {
  const found: CodeRef[] = [];
  walk(body, (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const name = ts.isPropertyAccessExpression(callee)
        ? callee.name.text
        : ts.isIdentifier(callee)
          ? callee.text
          : undefined;
      const firstArg = node.arguments[0];
      const isFixed =
        name === "waitForTimeout" ||
        (ts.isIdentifier(callee) && SLEEP_NAMES.has(callee.text) && !!firstArg && ts.isNumericLiteral(firstArg));
      if (isFixed) {
        found.push({ line: lineOf(node), text: collapse(node.getText()) });
        return false;
      }
    }
    // await new Promise((r) => setTimeout(r, 1000))
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "Promise" &&
      /\bsetTimeout\s*\(/.test(node.getText())
    ) {
      found.push({ line: lineOf(node), text: collapse(node.getText()) });
      return false;
    }
    return undefined;
  });
  return found;
}
