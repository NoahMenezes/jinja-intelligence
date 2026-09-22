import { describe, expect, it } from "vitest";
import { BUILTIN_DOCS, LOOP_ATTRIBUTE_DOCS } from "../../src/jinja/docs/builtins.js";
import { FILTER_DOCS } from "../../src/jinja/docs/filters.js";
import { KEYWORD_DOCS } from "../../src/jinja/docs/keywords.js";
import { TEST_DOCS } from "../../src/jinja/docs/tests.js";
import type { DocEntry } from "../../src/jinja/docs/types.js";
import { BUILTINS } from "../../src/jinja/syntax/builtins.js";
import { FILTERS } from "../../src/jinja/syntax/filters.js";
import { KEYWORDS } from "../../src/jinja/syntax/keywords.js";
import { TESTS } from "../../src/jinja/syntax/tests.js";
import { LOOP_ATTRIBUTES } from "../../src/jinja/analysis/symbols.js";

function assertCovered(table: Record<string, DocEntry>, keys: ReadonlySet<string>, tableName: string): void {
  for (const key of keys) {
    const entry: DocEntry | undefined = table[key];
    expect(entry, `${tableName} missing: ${key}`).toBeDefined();
    if (entry === undefined) {
      throw new Error(`${tableName} missing: ${key}`);
    }
    expect(entry.signature.length, `${tableName}[${key}] signature`).toBeGreaterThan(0);
    expect(entry.description.length, `${tableName}[${key}] description`).toBeGreaterThan(0);
  }
  for (const key of Object.keys(table)) {
    expect(keys.has(key), `${tableName} documents unknown name: ${key}`).toBe(true);
  }
}

describe("docs coverage", () => {
  it("documents every filter, test, keyword, and builtin", () => {
    assertCovered(FILTER_DOCS, FILTERS, "FILTER_DOCS");
    assertCovered(TEST_DOCS, TESTS, "TEST_DOCS");
    assertCovered(KEYWORD_DOCS, KEYWORDS, "KEYWORD_DOCS");
    assertCovered(BUILTIN_DOCS, BUILTINS, "BUILTIN_DOCS");
  });

  it("documents every loop attribute", () => {
    for (const attr of LOOP_ATTRIBUTES) {
      const entry: DocEntry | undefined = LOOP_ATTRIBUTE_DOCS[attr];
      expect(entry, `LOOP_ATTRIBUTE_DOCS missing: ${attr}`).toBeDefined();
      if (entry === undefined) {
        throw new Error(`LOOP_ATTRIBUTE_DOCS missing: ${attr}`);
      }
      expect(entry.signature).toContain(attr);
    }
  });
});
