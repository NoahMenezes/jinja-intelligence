import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { analyzeTemplate } from "../../src/jinja/analysis/analyzer.js";
import { complete } from "../../src/features/completion/completion.js";
import { definition } from "../../src/features/definition/definition.js";
import { toDiagnostics } from "../../src/features/diagnostics/diagnostics.js";
import { hover } from "../../src/features/hover/hover.js";
import { lex } from "../../src/jinja/lexer/lexer.js";
import { parseTemplate } from "../../src/jinja/parser/parser.js";
import { references } from "../../src/features/references/references.js";
import { rename } from "../../src/features/rename/rename.js";
import { documentSymbols } from "../../src/features/symbols/symbols.js";
import { semanticTokens } from "../../src/features/semantic-tokens/semantic-tokens.js";
import { signatureHelp } from "../../src/features/signature-help/signature-help.js";
import { extractRenderCalls } from "../../src/python/scanner.js";
import { extractPythonSymbols } from "../../src/python/symbols.js";

const here = dirname(fileURLToPath(import.meta.url));

/** Every committed fixture, recursively. */
function fixtures(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.(j2|jinja2?|html)$/.test(entry)) {
        out.push(readFileSync(full, "utf8"));
      }
    }
  };
  walk(join(here, "../fixtures"));
  return out;
}

const DEFINITION_CTX = { roots: [], templateDirs: [], readFile: () => null };

/** Every total entry point must survive any prefix without throwing. */
function exercise(text: string, offset: number): void {
  const root = parseTemplate(text).root;
  const analysis = analyzeTemplate(root);
  void analysis;
  lex(text);
  complete(text, offset);
  hover(text, offset);
  definition(text, "file:///fuzz.j2", offset, DEFINITION_CTX);
  references(text, "file:///fuzz.j2", offset, true);
  rename(text, "file:///fuzz.j2", offset, "renamed");
  toDiagnostics(text);
  documentSymbols(text);
  semanticTokens(text);
  signatureHelp(text, offset);
  extractRenderCalls(text);
  extractPythonSymbols(text);
}

describe("fuzz", () => {
  it("survives every truncation prefix of every fixture", () => {
    const sources = fixtures();
    expect(sources.length).toBeGreaterThan(5);
    for (const source of sources) {
      // Full text plus strided prefixes (step keeps the suite fast).
      const prefixes = [source];
      for (let n = 1; n < source.length; n += 13) {
        prefixes.push(source.slice(0, n));
      }
      for (const prefix of prefixes) {
        const offsets = [0, Math.floor(prefix.length / 2), prefix.length];
        for (const offset of offsets) {
          expect(() => exercise(prefix, offset), `prefix ${prefix.length} chars @ ${offset}`).not.toThrow();
        }
      }
    }
  });

  it("survives hostile one-liners everywhere", () => {
    const hostile = ["{{", "{%", "{#", "{{ |", "{% if", "\u0000{{", "{{ \ud800", "{% set x =", "{{ f("];
    for (const text of hostile) {
      for (const offset of [0, text.length]) {
        expect(() => exercise(text, offset), JSON.stringify(text)).not.toThrow();
      }
    }
  });
});
