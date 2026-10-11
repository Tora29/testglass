import type { InputAdapter } from "../adapters/types.js";
import { createJsAdapter, importsAny, JS_TEST_FILE } from "./js/adapter.js";
import { playwrightActionSteps, playwrightStepTitles, statementSteps } from "./js/steps.js";

export const PLAYWRIGHT_MODULES = [
  "@playwright/test",
  "playwright/test",
  "@playwright/experimental-ct-react",
  "@playwright/experimental-ct-vue",
  "@playwright/experimental-ct-svelte",
] as const;

/** 本体の引数でこれらを受け取っていれば Playwright のテストとみなす */
const PW_FIXTURES: ReadonlySet<string> = new Set(["page", "context", "browser", "browserName", "request"]);

/**
 * Playwright のテストらしいか。自作 fixtures（`import { test } from './fixtures'`）経由でも
 * 判定できるよう、本体が `({ page })` などの fixture を受け取っているかも見る。
 */
export function looksLikePlaywright(source: string): boolean {
  return importsAny(source, PLAYWRIGHT_MODULES) || hasFixtureParam(source);
}

/** 正規表現の `\s` と同じ空白 */
const isSpace = (ch: string | undefined): boolean => ch !== undefined && /\s/.test(ch);
/** 正規表現の `\w`（`\b` の境界になる文字） */
const isWord = (ch: string | undefined): boolean => ch !== undefined && /\w/.test(ch);

/**
 * `({ page }) =>` / `({ page, context }, testInfo) =>` のように、fixture を分割代入で受け取るアロー関数があるか。
 *
 * 次の正規表現と同じものに一致する（`test/playwright-adapter.test.ts` で突き合わせている）。
 *
 *     /\(\s*\{[^}]*\b(page|context|browser|browserName|request)\b[^}]*\}\s*(?:,[^)]*)?\)\s*=>/
 *
 * 正規表現のままだと、`}` の無い `({page ({page …` のような入力でバックトラックが入力長の3乗になり、
 * 数十 KB のファイル1つで数秒以上止まる（解析するすべてのテストファイルに使うため）。ここでは1回の走査で判定する。
 *
 * - `[^}]*` は最初の `}` を越えないので、`{` の後の最初の `}` までが中身になる。同じ `}` で終わる `{` のうち、
 *   いちばん前のものの後に fixture 名があればよい（後ろの `{` の中身は前の `{` の中身に含まれる）
 * - `}` より後ろ（`\s*(?:,[^)]*)?\)\s*=>`）は `}` の位置だけで決まる。`,` の後は次の `)` まで進む
 */
function hasFixtureParam(source: string): boolean {
  const n = source.length;
  /** 直前の `}` より後ろで、最初に現れた `(\s*{` の `{` の位置（無ければ -1） */
  let open = -1;
  /** open より後ろに fixture 名の単語があるか */
  let named = false;
  /** 次の `)` の位置（-1: 無い、-2: まだ探していない）。`}` の位置は増える一方なので、探し直すのは越えたときだけ */
  let paren = -2;
  /** `)` の位置ごとの「後ろに \s*=> が続くか」 */
  const arrowAfter = new Map<number, boolean>();

  const nextParen = (from: number): number => {
    if (paren === -2 || (paren !== -1 && paren < from)) paren = source.indexOf(")", from);
    return paren;
  };
  const skipSpaces = (from: number): number => {
    let i = from;
    while (isSpace(source[i])) i++;
    return i;
  };
  const isArrowAfter = (p: number): boolean => {
    let hit = arrowAfter.get(p);
    if (hit === undefined) {
      const i = skipSpaces(p + 1);
      hit = source[i] === "=" && source[i + 1] === ">";
      arrowAfter.set(p, hit);
    }
    return hit;
  };
  /** `}`（close）の後ろが `\s*(?:,[^)]*)?\)\s*=>` か */
  const tailMatches = (close: number): boolean => {
    const i = skipSpaces(close + 1);
    const p = source[i] === ")" ? i : source[i] === "," ? nextParen(i + 1) : -1;
    return p >= 0 && isArrowAfter(p);
  };

  for (let i = 0; i < n; i++) {
    const ch = source[i];
    if (ch === "}") {
      if (named && tailMatches(i)) return true;
      open = -1;
      named = false;
    } else if (ch === "{") {
      if (open < 0) {
        let j = i - 1;
        while (isSpace(source[j])) j--;
        if (source[j] === "(") open = i;
      }
    } else if (isWord(ch)) {
      // \b…\b なので、前後が単語の文字でない（＝単語全体が fixture 名と同じ）ときだけ数える
      let j = i + 1;
      while (isWord(source[j])) j++;
      if (open >= 0 && !named && PW_FIXTURES.has(source.slice(i, j))) named = true;
      i = j - 1;
    }
  }
  return false;
}

/**
 * Playwright Test の入力アダプタ。
 * 手順は test.step のタイトル → 操作呼び出しの要約 → 文の1行化 の順に採用する。
 */
export const playwrightAdapter: InputAdapter = createJsAdapter({
  name: "playwright",
  profile: {
    modules: PLAYWRIGHT_MODULES,
    testNames: ["test"],
    suiteNames: [],
    suiteProperties: ["describe"],
    chainProperties: {
      skip: "skip",
      fixme: "skip",
      only: "only",
      serial: null,
      parallel: null,
      fail: null,
      slow: null,
    },
  },
  match(filePath, source) {
    return JS_TEST_FILE.test(filePath) && !importsAny(source, ["vitest"]) && looksLikePlaywright(source);
  },
  steps({ body, testName }) {
    const titles = playwrightStepTitles(body, testName);
    if (titles.length > 0) return titles;
    const actions = playwrightActionSteps(body);
    if (actions.length > 0) return actions;
    return statementSteps(body);
  },
});
