import { isAssertionExpression, isAssertionStatement } from "./assertions.js";
import { collapse, flattenChain, isFunctionLike, stringValue, truncate, ts, unwrap, walk } from "./ast.js";

type Body = ts.ArrowFunction | ts.FunctionExpression;

// ---------------------------------------------------------------------------
// 文の1行化（Vitest、および Playwright で操作が見つからないときの手順）
// ---------------------------------------------------------------------------

/** 本体直下の文を、アサーションを除いて1行ずつ要約する */
export function statementSteps(body: Body): string[] {
  if (!ts.isBlock(body.body)) {
    const expr = body.body;
    return isAssertionExpression(expr) ? [] : [truncate(collapse(expr.getText()))];
  }
  return body.body.statements.filter((s) => !isAssertionStatement(s)).map(summarizeStatement);
}

function summarizeStatement(stmt: ts.Statement): string {
  const mock = mockTarget(stmt);
  if (mock) return `mock: ${mock}`;

  const block = blockHeader(stmt);
  if (block) return truncate(block);

  return truncate(collapse(stmt.getText()).replace(/;$/, ""));
}

/** if / for / try などは本体を省略して `if (cond) { … }` の形にする */
function blockHeader(stmt: ts.Statement): string | undefined {
  const head = (inner: ts.Node): string =>
    `${collapse(stmt.getText().slice(0, inner.getStart() - stmt.getStart()))} { … }`;
  if (ts.isIfStatement(stmt)) return head(stmt.thenStatement) + (stmt.elseStatement ? " else { … }" : "");
  if (ts.isForStatement(stmt) || ts.isForOfStatement(stmt) || ts.isForInStatement(stmt) || ts.isWhileStatement(stmt)) {
    return head(stmt.statement);
  }
  if (ts.isDoStatement(stmt)) return `do { … } while (${collapse(stmt.expression.getText())})`;
  if (ts.isTryStatement(stmt)) return `try { … }${stmt.catchClause ? " catch { … }" : ""}`;
  if (ts.isSwitchStatement(stmt)) return `switch (${collapse(stmt.expression.getText())}) { … }`;
  if (ts.isBlock(stmt)) return "{ … }";
  return undefined;
}

const MOCK_METHODS =
  /^mock(ResolvedValue|RejectedValue|ReturnValue|Implementation|Resolved|Rejected|Return)(Once)?$|^mockClear$|^mockReset$|^mockRestore$/;
const MOCK_NAMESPACES = new Set(["vi", "jest"]);

/** モックを設定する文なら、その対象（`api.get` など）を返す */
function mockTarget(stmt: ts.Statement): string | undefined {
  let expr: ts.Expression | undefined;
  let declaredName: string | undefined;
  if (ts.isExpressionStatement(stmt)) expr = unwrap(stmt.expression);
  else if (ts.isVariableStatement(stmt)) {
    const decl = stmt.declarationList.declarations[0];
    if (stmt.declarationList.declarations.length === 1 && decl?.initializer) {
      expr = unwrap(decl.initializer);
      declaredName = decl.name.getText();
    }
  }
  if (!expr || !ts.isCallExpression(expr)) return undefined;

  // 連鎖を外側から内側へたどり、モック関連の呼び出しを探す
  let cur: ts.Expression = expr;
  let isMock = false;
  while (ts.isCallExpression(cur) || ts.isPropertyAccessExpression(cur)) {
    if (ts.isCallExpression(cur)) {
      const callee = cur.expression;
      if (ts.isPropertyAccessExpression(callee)) {
        const ns = ts.isIdentifier(callee.expression) ? callee.expression.text : undefined;
        const method = callee.name.text;
        if (ns && MOCK_NAMESPACES.has(ns)) {
          if (method === "spyOn") {
            const [obj, prop] = cur.arguments;
            const propName = stringValue(prop);
            return obj && propName ? `${collapse(obj.getText())}.${propName}` : collapse(cur.getText());
          }
          if (method === "mocked") return cur.arguments[0] ? collapse(cur.arguments[0].getText()) : undefined;
          if (method === "fn") return declaredName ?? "fn()";
          if (method === "mock" || method === "doMock") {
            return stringValue(cur.arguments[0]) ?? collapse(cur.getText());
          }
          return undefined;
        }
        if (MOCK_METHODS.test(method)) {
          isMock = true;
          const target = callee.expression;
          if (!ts.isCallExpression(target)) return collapse(target.getText());
        }
      }
    }
    cur = cur.expression;
  }
  return isMock ? collapse(cur.getText()) : undefined;
}

// ---------------------------------------------------------------------------
// Playwright：test.step のタイトル → 操作呼び出しの要約 → 文の1行化
// ---------------------------------------------------------------------------

/** 本体の中の test.step('…') のタイトル。入れ子は字下げで表す */
export function playwrightStepTitles(body: Body, testName: string): string[] {
  const titles: string[] = [];
  const visit = (node: ts.Node, depth: number): void => {
    if (ts.isCallExpression(node) && isStepCall(node, testName)) {
      const title = stringValue(node.arguments[0]) ?? collapse(node.arguments[0]?.getText() ?? "");
      titles.push("  ".repeat(depth) + title);
      const fn = node.arguments.find(isFunctionLike);
      if (fn) ts.forEachChild(fn.body, (child) => visit(child, depth + 1));
      return;
    }
    ts.forEachChild(node, (child) => visit(child, depth));
  };
  ts.forEachChild(body.body, (child) => visit(child, 0));
  return titles;
}

function isStepCall(node: ts.CallExpression, testName: string): boolean {
  const chain = flattenChain(node.expression);
  return chain.root?.text === testName && chain.names.length === 1 && chain.names[0] === "step";
}

const ACTIONS = new Set([
  "goto",
  "reload",
  "goBack",
  "goForward",
  "click",
  "dblclick",
  "tap",
  "fill",
  "type",
  "pressSequentially",
  "press",
  "check",
  "uncheck",
  "setChecked",
  "selectOption",
  "selectText",
  "hover",
  "focus",
  "blur",
  "clear",
  "setInputFiles",
  "dragTo",
  "dragAndDrop",
  "waitForTimeout",
  "down",
  "up",
  "insertText",
  "move",
  "wheel",
]);

/** keyboard / mouse の下にあるときだけ操作とみなすメソッド */
const DEVICE_ONLY = new Set(["down", "up", "insertText", "move", "wheel"]);
const DEVICES = new Set(["keyboard", "mouse", "touchscreen"]);

/** page.click などの操作呼び出しを要約する */
export function playwrightActionSteps(body: Body): string[] {
  const locals = collectLocatorVariables(body);
  const steps: string[] = [];
  walk(body.body, (node) => {
    if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return;
    const action = node.expression.name.text;
    if (!ACTIONS.has(action)) return;
    const receiver = node.expression.expression;
    const receiverChain = flattenChain(receiver);
    if (receiverChain.root?.text === "expect") return;
    const device = receiverChain.names.at(-1);
    const isDevice = !!device && DEVICES.has(device);
    if (DEVICE_ONLY.has(action) && !isDevice) return;

    const target = isDevice ? device : describeLocator(receiver, locals);
    const args = node.arguments.map((a) => describeArg(a, locals));
    const label = isDevice ? `${device}.${action}` : action;
    let text: string;
    if (action === "goto") text = `goto ${args[0] ?? ""}`;
    else if (action === "dragTo") text = `dragTo ${target} → ${args[0] ?? ""}`;
    else if (isDevice) text = [label, args.join(", ")].filter(Boolean).join(" ");
    else {
      text = [label, target].filter(Boolean).join(" ");
      const value = action === "waitForTimeout" ? args[0] : valueArg(action, args);
      if (value) text += action === "waitForTimeout" ? ` ${value}` : ` ← ${value}`;
    }
    steps.push(truncate(text.trim()));
    return false;
  });
  return steps;
}

/** 値を受け取る操作の値（オプション引数は除く） */
function valueArg(action: string, args: string[]): string | undefined {
  if (["fill", "type", "pressSequentially", "press", "selectOption", "setInputFiles", "setChecked"].includes(action)) {
    return args[0];
  }
  return undefined;
}

/** テスト内で `const btn = page.getByRole(…)` のように宣言したロケーター */
function collectLocatorVariables(body: Body): Map<string, ts.Expression> {
  const locals = new Map<string, ts.Expression>();
  walk(body.body, (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      LOCATOR_METHODS.has(flattenChain(node.initializer.expression).names.at(-1) ?? "")
    ) {
      locals.set(node.name.text, node.initializer);
    }
  });
  return locals;
}

const LOCATOR_METHODS = new Set([
  "getByRole",
  "getByLabel",
  "getByText",
  "getByPlaceholder",
  "getByTestId",
  "getByAltText",
  "getByTitle",
  "locator",
  "frameLocator",
  "first",
  "last",
  "nth",
  "filter",
  "and",
  "or",
]);

const GET_BY_PREFIX: Record<string, string> = {
  getByLabel: "",
  getByText: "text",
  getByPlaceholder: "placeholder",
  getByTestId: "testid",
  getByAltText: "alt",
  getByTitle: "title",
};

/**
 * ロケーターの連鎖を短い名前にする。
 *   page.getByRole('button', { name: 'ログイン' }) → button[ログイン]
 *   page.getByLabel('メール')                      → [メール]
 *   page.locator('.row').nth(2)                   → .row >> nth(2)
 */
function describeLocator(expr: ts.Expression, locals: Map<string, ts.Expression>, depth = 0): string {
  const parts: string[] = [];
  const calls: ts.CallExpression[] = [];
  let base: ts.Expression = unwrap(expr);
  while (ts.isCallExpression(base) && ts.isPropertyAccessExpression(base.expression)) {
    calls.unshift(base);
    base = base.expression.expression;
  }
  if (ts.isIdentifier(base) && locals.has(base.text) && depth < 5) {
    parts.push(describeLocator(locals.get(base.text)!, locals, depth + 1));
  } else {
    const baseText = collapse(base.getText());
    // page / this.page は省略する
    if (baseText !== "page" && !baseText.endsWith(".page")) parts.push(baseText);
  }

  for (const call of calls) {
    const method = (call.expression as ts.PropertyAccessExpression).name.text;
    const [a0, a1] = call.arguments;
    const s0 = stringValue(a0) ?? (a0 ? collapse(a0.getText()) : "");
    if (method === "getByRole") {
      const name = a1 && ts.isObjectLiteralExpression(a1) ? objectProp(a1, "name") : undefined;
      parts.push(name ? `${s0}[${name}]` : s0);
    } else if (method in GET_BY_PREFIX) {
      parts.push(`${GET_BY_PREFIX[method]}[${s0}]`);
    } else if (method === "locator") {
      parts.push(s0);
    } else if (method === "frameLocator") {
      parts.push(`frame(${s0})`);
    } else if (method === "first" || method === "last") {
      parts.push(method);
    } else if (method === "nth") {
      parts.push(`nth(${s0})`);
    } else if (method === "filter" || method === "and" || method === "or") {
      parts.push(`${method}(${truncate(collapse(call.arguments.map((a) => a.getText()).join(", ")), 30)})`);
    } else {
      // 未知のメソッド（ページオブジェクトなど）はそのまま残す
      parts.push(`${method}()`);
    }
  }
  return parts.join(" >> ");
}

function objectProp(obj: ts.ObjectLiteralExpression, key: string): string | undefined {
  for (const p of obj.properties) {
    if (ts.isPropertyAssignment(p) && p.name.getText() === key) {
      return stringValue(p.initializer) ?? collapse(p.initializer.getText());
    }
  }
  return undefined;
}

function describeArg(arg: ts.Expression, locals: Map<string, ts.Expression>): string {
  const s = stringValue(arg);
  if (s !== undefined) return s;
  if (ts.isIdentifier(arg) && locals.has(arg.text)) return describeLocator(arg, locals);
  if (ts.isCallExpression(arg) && LOCATOR_METHODS.has(flattenChain(arg.expression).names.at(-1) ?? "")) {
    return describeLocator(arg, locals);
  }
  if (ts.isObjectLiteralExpression(arg)) return "{ … }";
  return collapse(arg.getText());
}
