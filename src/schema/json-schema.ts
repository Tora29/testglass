import { MODIFIERS, SCHEMA_VERSION } from "./types.js";

/** spec.json の JSON Schema（draft 2020-12）。types.ts と同期させること。 */
export const specJsonSchema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://github.com/Tora29/testglass/schema/v1.json",
  title: "testglass spec.json",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "generatedAt", "files"],
  properties: {
    schemaVersion: { const: SCHEMA_VERSION },
    generatedAt: { type: "string", format: "date-time" },
    files: { type: "array", items: { $ref: "#/$defs/TestFile" } },
  },
  $defs: {
    TestFile: {
      type: "object",
      additionalProperties: false,
      required: ["path", "framework", "tests"],
      properties: {
        path: { type: "string" },
        framework: { type: "string" },
        tests: { type: "array", items: { $ref: "#/$defs/TestCase" } },
      },
    },
    TestCase: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "suites",
        "title",
        "location",
        "modifiers",
        "steps",
        "assertions",
        "warnings",
        "source",
      ],
      properties: {
        id: { type: "string" },
        suites: { type: "array", items: { type: "string" } },
        title: { type: "string" },
        location: { $ref: "#/$defs/SourceLocation" },
        modifiers: {
          type: "array",
          items: { enum: [...MODIFIERS] },
          uniqueItems: true,
        },
        steps: { type: "array", items: { type: "string" } },
        assertions: { type: "array", items: { $ref: "#/$defs/Assertion" } },
        warnings: { type: "array", items: { $ref: "#/$defs/Warning" } },
        source: { type: "string" },
        fingerprint: { type: "string" },
      },
    },
    SourceLocation: {
      type: "object",
      additionalProperties: false,
      required: ["line", "column"],
      properties: {
        line: { type: "integer", minimum: 1 },
        column: { type: "integer", minimum: 1 },
      },
    },
    Assertion: {
      type: "object",
      additionalProperties: false,
      required: ["line", "text"],
      properties: {
        line: { type: "integer", minimum: 1 },
        text: { type: "string" },
      },
    },
    Warning: {
      type: "object",
      additionalProperties: false,
      required: ["rule", "severity", "message"],
      properties: {
        rule: { type: "string" },
        severity: { enum: ["error", "warn"] },
        message: { type: "string" },
        line: { type: "integer", minimum: 1 },
      },
    },
  },
} as const;
