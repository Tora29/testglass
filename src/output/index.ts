import type { OutputAdapter } from "../adapters/types.js";
import { csvAdapter } from "./csv.js";
import { htmlAdapter } from "./html/index.js";
import { markdownAdapter } from "./markdown.js";

/** 組み込みの出力アダプタ */
export const builtinOutputAdapters: readonly OutputAdapter[] = [
  htmlAdapter as OutputAdapter,
  markdownAdapter as OutputAdapter,
  csvAdapter as OutputAdapter,
];
