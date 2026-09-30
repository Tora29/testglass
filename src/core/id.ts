import { createHash } from "node:crypto";

const SEP = "\u0000";

/** テストID：ファイルパス＋describe階層＋テスト名のハッシュ（先頭16桁）。 */
export function testId(path: string, suites: readonly string[], title: string): string {
  return hash([path, ...suites, title].join(SEP));
}

export function hash(input: string): string {
  return createHash("sha256").update(input).digest("hex").slice(0, 16);
}
