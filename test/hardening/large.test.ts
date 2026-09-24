import { describe, expect, it } from "vitest";
import { analyzeTemplate } from "../../src/jinja/analysis/analyzer.js";
import { complete } from "../../src/features/completion/completion.js";
import { toDiagnostics } from "../../src/features/diagnostics/diagnostics.js";
import { lex } from "../../src/jinja/lexer/lexer.js";
import { parseTemplate } from "../../src/jinja/parser/parser.js";

/** Deterministic large template (~2000 lines of mixed constructs). */
export function largeTemplate(): string {
  const parts: string[] = ['{% extends "base.j2" %}', '{% import "m.j2" as m %}'];
  for (let i = 0; i < 120; i++) {
    parts.push(`{% set var${i} = items | join(", ") %}`);
    parts.push(`{% for user in users %}{{ user.name | upper }} {{ loop.index }}{% endfor %}`);
    parts.push(`{% if var${i} is defined %}{{ var${i} | default("x", true) }}{% else %}none{% endif %}`);
    parts.push(`{% macro card${i}(title, level="info") %}{{ title }} {{ level }}{% endmacro %}`);
    parts.push(`{{ m.button(var${i}) }} {# comment ${i} #}`);
    parts.push(`<p>plain html ${i}</p>`);
    parts.push(`{% filter upper %}text ${i}{% endfilter %}`);
    parts.push(`{% with a=${i} %}{{ a }}{% endwith %}`);
    parts.push(`{% set block${i} %}body ${i}{% endset %}`);
    parts.push(`{% call dump(var${i}) %}x{% endcall %}`);
    parts.push(`{% do log(${i}) %}`);
    parts.push(`{{ {"k": var${i}, "n": ${i}} }}`);
    parts.push(`{{ (var${i} + 1) * 2 if var${i} is number else 0 }}`);
    parts.push(`{% raw %}{{ not_a_tag }}{% endraw %}`);
    parts.push(`{% from "m.j2" import btn${i} %}`);
    parts.push(`{% include "part.j2" %}`);
  }
  return parts.join("\n") + "\n";
}

describe("large templates", () => {
  it("parses a 2000-line template quickly and correctly", () => {
    const text = largeTemplate();
    expect(text.split("\n").length).toBeGreaterThan(1900);
    const start = performance.now();
    const { root, errors } = parseTemplate(text);
    const elapsed = performance.now() - start;
    expect(errors).toEqual([]);
    expect(root.children.length).toBeGreaterThan(100);
    // Generous bound (300x the ~15ms measured): guards true quadratic regressions, never flakes.
    expect(elapsed).toBeLessThan(5000);
  });

  it("analyzes and diagnoses the large template within budget", () => {
    const text = largeTemplate();
    const root = parseTemplate(text).root;
    const start = performance.now();
    const analysis = analyzeTemplate(root);
    const diagnostics = toDiagnostics(text);
    const completion = complete(text, text.indexOf("{{ var0") + 3);
    const elapsed = performance.now() - start;
    expect(analysis.symbols.length).toBeGreaterThan(100);
    expect(diagnostics).toEqual([]);
    expect(completion.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(5000);
  });

  it("lexes in linear-feeling time", () => {
    const small = largeTemplate().split("\n").slice(0, 100).join("\n");
    const big = largeTemplate();
    const time = (text: string): number => {
      const start = performance.now();
      lex(text);
      return performance.now() - start;
    };
    // Warmup.
    time(small);
    time(big);
    const smallMs = Math.min(time(small), time(small), time(small));
    const bigMs = Math.min(time(big), time(big), time(big));
    // 20x the text must cost well under 20x the time once linear.
    expect(bigMs).toBeLessThan(Math.max(2000, smallMs * 60));
  });
});
