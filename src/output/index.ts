import type { OutputAdapter } from "../adapters/types.js";
import { htmlAdapter } from "./html/index.js";

/** 組み込みの出力アダプタ */
export const builtinOutputAdapters: readonly OutputAdapter[] = [htmlAdapter as OutputAdapter];
