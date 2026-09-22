import { describe, expect, it } from "vitest";
import { signatureHelp } from "../../src/features/signature-help/signature-help.js";

function labelOf(result: NonNullable<ReturnType<typeof signatureHelp>>): string {
  return result.signatures[0]?.label ?? "";
}

describe("signature help", () => {
  it("shows macro signatures with the active parameter", () => {
    const text = '{% macro badge(text, level="info") %}x{% endmacro %}{{ badge("a", ';
    const first = signatureHelp(text, text.indexOf('badge("a"') + 7);
    expect(first).not.toBeNull();
    expect(labelOf(first!)).toBe('badge(text, level="info")');
    expect(first?.activeParameter).toBe(0);

    const second = signatureHelp(text, text.length);
    expect(second?.activeParameter).toBe(1);
  });

  it("counts keyword arguments positionally", () => {
    const text = "{% macro m(a, b) %}x{% endmacro %}{{ m(a=1, ";
    expect(signatureHelp(text, text.length)?.activeParameter).toBe(1);
  });

  it("shows filter signatures without parameter tracking", () => {
    const text = '{{ items | default("x", ';
    const result = signatureHelp(text, text.length);
    expect(result).not.toBeNull();
    expect(labelOf(result!)).toContain("default(");
    expect(result?.activeParameter).toBe(0);
  });

  it("returns null outside argument lists", () => {
    expect(signatureHelp("{{ badge }}", 8)).toBeNull();
    expect(signatureHelp("{{ badge(1) }}", 12)).toBeNull();
    expect(signatureHelp('{{ "text" }}', 5)).toBeNull();
    expect(signatureHelp("plain", 3)).toBeNull();
    expect(signatureHelp("{{ unknown( }}", 11)).toBeNull();
  });

  it("never throws on hostile input", () => {
    for (const text of ["{{ f(", "{{ f(a,", "{% macro m(", "{{ | ("]) {
      expect(() => signatureHelp(text, text.length)).not.toThrow();
    }
  });
});
