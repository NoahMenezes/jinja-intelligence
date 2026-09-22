import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lex } from "../../src/jinja/lexer/lexer.js";

const here = dirname(fileURLToPath(import.meta.url));

function kinds(source: string): string[] {
  return lex(source).tokens.map((t) => t.kind);
}

describe("lexer", () => {
  it("tokenizes a filtered expression", () => {
    const result = lex("{{ user.name | upper }}");
    expect(result.errors).toEqual([]);
    expect(kinds("{{ user.name | upper }}")).toEqual([
      "VariableOpen",
      "Identifier",
      "Dot",
      "Identifier",
      "Pipe",
      "Identifier",
      "VariableClose",
      "EOF",
    ]);
    const open = result.tokens[0];
    expect(open?.value).toBe("{{");
    expect(open?.start).toBe(0);
  });

  it("tokenizes blocks, comments, and text", () => {
    const result = lex("Hello {% if user %}x{# note #}y{% endif %}");
    expect(result.errors).toEqual([]);
    expect(kinds("Hello {% if user %}x{# note #}y{% endif %}")).toEqual([
      "Text",
      "BlockOpen",
      "Keyword",
      "Identifier",
      "BlockClose",
      "Text",
      "CommentOpen",
      "CommentText",
      "CommentClose",
      "Text",
      "BlockOpen",
      "Keyword",
      "BlockClose",
      "EOF",
    ]);
    expect(result.tokens[0]?.value).toBe("Hello ");
  });

  it("supports whitespace-control markers", () => {
    expect(kinds("{{- x -}}")).toEqual(["VariableOpen", "Identifier", "VariableClose", "EOF"]);
    expect(kinds("{%- if x -%}")).toEqual(["BlockOpen", "Keyword", "Identifier", "BlockClose", "EOF"]);
  });

  it("reports unterminated tags without throwing", () => {
    for (const source of ["{{ user.", "{{ user | up", "{% if user", "{# note", "{{ 'abc"]) {
      const result = lex(source);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.tokens[result.tokens.length - 1]?.kind).toBe("EOF");
    }
    expect(lex("{{ user.").errors[0]?.code).toBe("unterminated-variable");
    expect(lex("{% if user").errors[0]?.code).toBe("unterminated-block");
    expect(lex("{# note").errors[0]?.code).toBe("unterminated-comment");
  });

  it("computes multiline ranges", () => {
    const result = lex("a\n{{ x }}");
    const open = result.tokens.find((t) => t.kind === "VariableOpen");
    expect(open?.range.start).toEqual({ line: 1, character: 0 });
  });

  it("lexes valid and malformed fixtures", () => {
    const valid = readFileSync(join(here, "../fixtures/lexer/valid.j2"), "utf8");
    expect(lex(valid).errors).toEqual([]);
    const malformed = readFileSync(join(here, "../fixtures/lexer/malformed.j2"), "utf8");
    const bad = lex(malformed);
    expect(bad.errors.length).toBeGreaterThan(0);
    expect(bad.tokens[bad.tokens.length - 1]?.kind).toBe("EOF");
  });
});
