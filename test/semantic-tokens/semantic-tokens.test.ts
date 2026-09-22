import { describe, expect, it } from "vitest";
import {
  SEMANTIC_TOKENS_LEGEND,
  SEMANTIC_TOKEN_TYPES,
  semanticTokens,
} from "../../src/features/semantic-tokens/semantic-tokens.js";
import { createServerCapabilities } from "../../src/lsp/capabilities.js";

interface Decoded {
  readonly line: number;
  readonly character: number;
  readonly length: number;
  readonly type: string;
}

/** Decode delta-encoded data back to absolute tokens for assertions. */
export function decode(data: readonly number[]): Decoded[] {
  const out: Decoded[] = [];
  let line = 0;
  let character = 0;
  for (let i = 0; i + 4 < data.length + 1; i += 5) {
    const dl = data[i] ?? 0;
    const dc = data[i + 1] ?? 0;
    const length = data[i + 2] ?? 0;
    const type = data[i + 3] ?? 0;
    line += dl;
    character = dl === 0 ? character + dc : dc;
    out.push({ line, character, length, type: SEMANTIC_TOKEN_TYPES[type] ?? "?" });
  }
  return out;
}

describe("semantic tokens", () => {
  it("colors keywords, strings, numbers, comments, and names by role", () => {
    const text = '{# note #}\n{% for user in users %}{{ user }}{% endfor %}\n{{ "lit" }}{{ 42 }}';
    const decoded = decode(semanticTokens(text).data);
    const kinds = new Map(decoded.map((d) => [`${d.line}:${d.character}`, d.type]));
    expect(kinds.get("0:0")).toBe("operator");
    expect(decoded.some((d) => d.type === "comment")).toBe(true);
    expect(kinds.get("1:0")).toBe("operator");
    expect(kinds.get("1:3")).toBe("keyword");
    expect(kinds.get("1:26")).toBe("variable");
    expect(kinds.get("2:3")).toBe("string");
    expect(kinds.get("2:14")).toBe("number");
  });

  it("colors macros, params, filters, and properties distinctly", () => {
    const text = "{% for u in us %}{{ m(1) | upper }}{{ loop.index }}{% endfor %}{% macro m(p) %}{{ p }}{% endmacro %}";
    const decoded = decode(semanticTokens(text).data);
    const at = (line: number, character: number): string | undefined =>
      decoded.find((d) => d.line === line && d.character === character)?.type;
    // `m` definition, `p` parameter, `upper` filter, `loop.index` property chain.
    expect(at(0, 72)).toBe("macro");
    expect(at(0, 74)).toBe("parameter");
    expect(at(0, 27)).toBe("function");
    expect(at(0, 43)).toBe("property");
  });

  it("emits nothing for plain text and never throws when broken", () => {
    expect(semanticTokens("just text").data).toEqual([]);
    for (const text of ["{{", "{% if", "{# note", "{{ x |"]) {
      expect(() => semanticTokens(text)).not.toThrow();
      expect(Array.isArray(semanticTokens(text).data)).toBe(true);
    }
  });

  it("shares one legend with capabilities", () => {
    const caps = createServerCapabilities();
    const provider = caps.semanticTokensProvider;
    expect(provider).toBeDefined();
    if (provider === undefined || typeof provider === "boolean") {
      throw new Error("Expected a legend object.");
    }
    expect(provider.legend.tokenTypes).toEqual([...SEMANTIC_TOKENS_LEGEND.tokenTypes]);
    expect(provider.legend.tokenModifiers).toEqual([]);
  });
});
