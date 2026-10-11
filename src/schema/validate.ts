import { specJsonSchema } from "./json-schema.js";

/**
 * specJsonSchema が使っているキーワードだけを読む JSON Schema。
 * 依存を増やさずに spec.json を検証するためのもので、汎用の JSON Schema の検証器ではない
 * （format は見ない。generatedAt が日時として読めなくても、表示はそのまま書く）。
 */
interface Schema {
  type?: string;
  const?: unknown;
  enum?: readonly unknown[];
  required?: readonly string[];
  properties?: Readonly<Record<string, Schema>>;
  additionalProperties?: boolean;
  items?: Schema;
  uniqueItems?: boolean;
  minimum?: number;
  $ref?: string;
  $defs?: Readonly<Record<string, Schema>>;
}

/** 検証で見つかった誤り（最初の 1 件） */
export type SpecIssue =
  /** pointer の値の型が expected でない */
  | { kind: "type"; pointer: string; expected: string }
  /** pointer のオブジェクトに property が無い */
  | { kind: "required"; pointer: string; property: string }
  /** pointer のオブジェクトに未知の property がある */
  | { kind: "additional"; pointer: string; property: string }
  /** pointer の値が allowed のいずれでもない */
  | { kind: "enum"; pointer: string; allowed: readonly unknown[] }
  /** pointer の数値が minimum より小さい */
  | { kind: "minimum"; pointer: string; minimum: number }
  /** pointer の配列に同じ値が 2 つ以上ある */
  | { kind: "unique"; pointer: string };

const ROOT = specJsonSchema as Schema;

/** spec.json の値が specJsonSchema を満たすか調べ、満たさなければ最初の誤りを返す */
export function findSpecIssue(value: unknown): SpecIssue | undefined {
  return check(ROOT, value, "");
}

function check(schema: Schema, value: unknown, pointer: string): SpecIssue | undefined {
  if (schema.$ref) return check(resolveRef(schema.$ref), value, pointer);
  if ("const" in schema && value !== schema.const) return { kind: "enum", pointer, allowed: [schema.const] };
  if (schema.enum && !schema.enum.includes(value)) return { kind: "enum", pointer, allowed: schema.enum };
  if (schema.type && !hasType(value, schema.type)) return { kind: "type", pointer, expected: schema.type };
  if (typeof value === "number" && schema.minimum !== undefined && value < schema.minimum) {
    return { kind: "minimum", pointer, minimum: schema.minimum };
  }
  if (Array.isArray(value)) {
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) {
      return { kind: "unique", pointer };
    }
    if (schema.items) {
      for (const [i, item] of value.entries()) {
        const issue = check(schema.items, item, `${pointer}/${i}`);
        if (issue) return issue;
      }
    }
  } else if (isObject(value)) {
    for (const property of schema.required ?? []) {
      if (!Object.hasOwn(value, property)) return { kind: "required", pointer, property };
    }
    for (const [property, item] of Object.entries(value)) {
      const sub =
        schema.properties && Object.hasOwn(schema.properties, property) ? schema.properties[property] : undefined;
      if (sub) {
        const issue = check(sub, item, `${pointer}/${escapePointer(property)}`);
        if (issue) return issue;
      } else if (schema.additionalProperties === false) {
        return { kind: "additional", pointer, property };
      }
    }
  }
  return undefined;
}

function resolveRef(ref: string): Schema {
  const name = /^#\/\$defs\/(.+)$/.exec(ref)?.[1];
  const target = name && ROOT.$defs && Object.hasOwn(ROOT.$defs, name) ? ROOT.$defs[name] : undefined;
  if (!target) throw new Error(`Unknown $ref in specJsonSchema: ${ref}`);
  return target;
}

function hasType(value: unknown, type: string): boolean {
  switch (type) {
    case "object":
      return isObject(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "integer":
      return Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    default:
      throw new Error(`Unsupported type in specJsonSchema: ${type}`);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** JSON Pointer（RFC 6901）のエスケープ */
function escapePointer(key: string): string {
  return key.replace(/~/g, "~0").replace(/\//g, "~1");
}
