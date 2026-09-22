import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DiagnosticSeverity } from "vscode-languageserver/node.js";
import { describe, expect, it } from "vitest";
import { publishDiagnostics, toDiagnostics } from "../../src/features/diagnostics/diagnostics.js";
import { DIAGNOSTIC_RULES, DIAGNOSTIC_SOURCE } from "../../src/features/diagnostics/rules.js";

const here = dirname(fileURLToPath(import.meta.url));

function fixture(name: string): string {
  return readFileSync(join(here, `../fixtures/diagnostics/${name}`), "utf8");
}

function codes(text: string): string[] {
  return toDiagnostics(text).map((d) => String(d.code));
}

describe("diagnostic rules", () => {
  it("covers every parser error code as an error from this server", () => {
    const expected = [
      "unterminated-variable",
      "unterminated-block",
      "unterminated-comment",
      "unterminated-string",
      "unterminated-expression",
      "expected-expression",
      "expected-property",
      "expected-close",
      "missing-end-tag",
      "mismatched-end-tag",
      "expected-statement",
      "expected-block-name",
    ];
    expect(Object.keys(DIAGNOSTIC_RULES).sort()).toEqual([...expected].sort());
    for (const rule of Object.values(DIAGNOSTIC_RULES)) {
      expect(rule.severity).toBe(DiagnosticSeverity.Error);
      expect(rule.source).toBe(DIAGNOSTIC_SOURCE);
    }
  });
});

describe("toDiagnostics", () => {
  it("returns no diagnostics for valid templates", () => {
    expect(toDiagnostics("Hello {{ user.name | upper }}!")).toEqual([]);
    expect(toDiagnostics("{% if a %}x{% endif %}")).toEqual([]);
    expect(toDiagnostics("")).toEqual([]);
  });

  it("reports missing and mismatched end tags", () => {
    expect(codes("{% if user %}x")).toContain("missing-end-tag");
    expect(codes("{% endif %}")).toContain("mismatched-end-tag");
    expect(codes("{% if a %}{% endfor %}")).toContain("mismatched-end-tag");
  });

  it("reports malformed and incomplete expressions", () => {
    expect(codes("{{ user. }}")).toContain("expected-property");
    expect(codes("{{ user | }}")).toContain("expected-expression");
    expect(codes("{{ user")).toContain("unterminated-variable");
    expect(codes("{% if user")).toContain("unterminated-block");
  });

  it("stays silent on unknown tags by design", () => {
    expect(toDiagnostics("{% fro x %}")).toEqual([]);
  });

  it("covers typing states without throwing", () => {
    for (const text of ["{% if user %}", "{{ user.", "{% for x in y %}", "{{", "{%"]) {
      const diagnostics = toDiagnostics(text);
      expect(Array.isArray(diagnostics)).toBe(true);
      expect(diagnostics.length).toBeGreaterThan(0);
    }
  });

  it("keeps ranges in bounds with source and message", () => {
    const [first] = toDiagnostics("{{ user. }}");
    expect(first).toBeDefined();
    if (first === undefined) {
      throw new Error("Expected a diagnostic.");
    }
    expect(first.source).toBe(DIAGNOSTIC_SOURCE);
    expect(first.message.length).toBeGreaterThan(0);
    expect(first.range.start.line).toBe(0);
    expect(first.range.end.character).toBeLessThanOrEqual("{{ user. }}".length);
  });
});

describe("diagnostic fixtures", () => {
  it("flags broken fixtures and clears valid ones", () => {
    expect(toDiagnostics(fixture("unclosed.j2")).length).toBeGreaterThan(0);
    expect(toDiagnostics(fixture("end-mismatch.j2")).length).toBeGreaterThan(0);
    expect(toDiagnostics(fixture("valid.j2"))).toEqual([]);
  });
});

describe("publishDiagnostics", () => {
  it("always sends, including empty batches, with version", () => {
    const sent: { uri: string; version?: number; diagnostics: unknown[] }[] = [];
    const sender = {
      sendDiagnostics(params: { uri: string; version?: number; diagnostics: unknown[] }): void {
        sent.push(params);
      },
    };
    publishDiagnostics(sender, "file:///a.html", 3, "{{ user. }}");
    expect(sent.length).toBe(1);
    expect(sent[0]?.version).toBe(3);
    expect(sent[0]?.diagnostics.length).toBeGreaterThan(0);
    publishDiagnostics(sender, "file:///a.html", 4, "{{ user.name }}");
    expect(sent.length).toBe(2);
    expect(sent[1]?.diagnostics).toEqual([]);
  });

  it("omits version when unknown and survives sender failures", () => {
    const sent: { version?: number }[] = [];
    publishDiagnostics(
      {
        sendDiagnostics(params: { version?: number }): void {
          sent.push(params);
        },
      },
      "file:///a.html",
      null,
      "{{ user. }}",
    );
    expect(sent[0]).not.toHaveProperty("version");
    expect(() =>
      publishDiagnostics(
        {
          sendDiagnostics(): void {
            throw new Error("down");
          },
        },
        "file:///a.html",
        1,
        "{{ user. }}",
      ),
    ).not.toThrow();
  });
});
