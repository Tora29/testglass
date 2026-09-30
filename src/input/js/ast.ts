import ts from "typescript";

export { ts };

export function createSource(filePath: string, source: string): ts.SourceFile {
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKindOf(filePath));
}

function scriptKindOf(filePath: string): ts.ScriptKind {
  if (/\.tsx$/i.test(filePath)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(filePath)) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/i.test(filePath)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/** 1始まりの行・列 */
export function positionOf(node: ts.Node): { line: number; column: number } {
  const sf = node.getSourceFile();
  const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  return { line: line + 1, column: character + 1 };
}

export function lineOf(node: ts.Node): number {
  return positionOf(node).line;
}

export function isFunctionLike(node: ts.Node | undefined): node is ts.ArrowFunction | ts.FunctionExpression {
  return !!node && (ts.isArrowFunction(node) || ts.isFunctionExpression(node));
}

/** 文字列リテラル（置換のないテンプレートを含む）なら値を返す */
export function stringValue(node: ts.Node | undefined): string | undefined {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return undefined;
}

/** `a.b.c` / `a.b(…).c` のような呼び出し・プロパティ連鎖を分解する */
export interface Chain {
  /** 連鎖の根にある識別子（無ければ undefined） */
  root: ts.Identifier | undefined;
  /** 根から順にたどったプロパティ名（呼び出しは含めない） */
  names: string[];
}

export function flattenChain(node: ts.Expression): Chain {
  const names: string[] = [];
  let cur: ts.Expression = node;
  for (;;) {
    if (ts.isCallExpression(cur)) cur = cur.expression;
    else if (ts.isPropertyAccessExpression(cur)) {
      names.unshift(cur.name.text);
      cur = cur.expression;
    } else if (ts.isElementAccessExpression(cur)) cur = cur.expression;
    else if (ts.isTaggedTemplateExpression(cur)) cur = cur.tag;
    else if (ts.isNonNullExpression(cur) || ts.isParenthesizedExpression(cur)) cur = cur.expression;
    else if (ts.isExpressionWithTypeArguments(cur)) cur = cur.expression;
    else break;
  }
  return { root: ts.isIdentifier(cur) ? cur : undefined, names };
}

/** `await x` / `void x` / `(x)` を外す */
export function unwrap(node: ts.Expression): ts.Expression {
  let cur = node;
  while (ts.isAwaitExpression(cur) || ts.isVoidExpression(cur) || ts.isParenthesizedExpression(cur)) {
    cur = cur.expression;
  }
  return cur;
}

/** 空白（改行を含む）を1つに詰める */
export function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function truncate(text: string, max = 80): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : `${chars.slice(0, max - 1).join("")}…`;
}

/** ノードのソースを、宣言位置のインデントを基準に字下げを戻して返す */
export function dedentedText(node: ts.Node): string {
  const sf = node.getSourceFile();
  const start = node.getStart(sf);
  const lineStart = sf.getLineStarts()[sf.getLineAndCharacterOfPosition(start).line] ?? 0;
  const indent = /^[ \t]*/.exec(sf.text.slice(lineStart, start))?.[0].length ?? 0;
  const lines = node.getText(sf).split(/\r?\n/);
  return lines.map((line, i) => (i === 0 ? line : line.replace(new RegExp(`^[ \\t]{0,${indent}}`), ""))).join("\n");
}

/** コメントと空白を除いたトークン列（重複検出用の正規化） */
export function tokenize(node: ts.Node): string {
  const sf = node.getSourceFile();
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, sf.languageVariant, node.getText(sf));
  const tokens: string[] = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    tokens.push(scanner.getTokenText());
  }
  return tokens.join(" ");
}

/** 子孫を出現順にたどる（visit が false を返したら、その子孫には入らない） */
// biome-ignore lint/suspicious/noConfusingVoidType: visit は何も返さなくてよい（false のときだけ子孫を飛ばす）
export function walk(node: ts.Node, visit: (node: ts.Node) => boolean | void): void {
  const rec = (n: ts.Node): void => {
    if (visit(n) === false) return;
    ts.forEachChild(n, rec);
  };
  ts.forEachChild(node, rec);
}
