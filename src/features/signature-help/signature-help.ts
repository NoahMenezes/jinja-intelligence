import type { SignatureHelp } from "vscode-languageserver/node.js";
import { analyzeTemplate, resolveAt } from "../../jinja/analysis/analyzer.js";
import { lookup, scopeAt } from "../../jinja/analysis/scope.js";
import type { MacroNode } from "../../jinja/ast/nodes.js";
import { findMacro } from "../../jinja/ast/query.js";
import { FILTER_DOCS } from "../../jinja/docs/filters.js";
import { lex } from "../../jinja/lexer/lexer.js";
import type { Token } from "../../jinja/lexer/token-types.js";
import { previousSignificant } from "../../jinja/lexer/tokens.js";
import { parseTemplate } from "../../jinja/parser/parser.js";

interface CallSite {
  readonly kind: "call";
  readonly callee: string;
  readonly calleeOffset: number;
  readonly activeParameter: number;
}

interface FilterSite {
  readonly kind: "filter";
  readonly name: string;
}

/**
 * Signature help inside unclosed call/filter argument lists. Macro calls
 * render real signatures with the active parameter; filters show their doc
 * signature with activeParameter 0. Total, never throws.
 */
export function signatureHelp(text: string, offset: number): SignatureHelp | null {
  try {
    const at = Math.min(Math.max(0, offset), text.length);
    const site = callSite(text, at);
    if (site === null) {
      return null;
    }
    if (site.kind === "filter") {
      const doc = FILTER_DOCS[site.name];
      if (doc === undefined) {
        return null;
      }
      return {
        signatures: [{ label: doc.signature, documentation: doc.description, parameters: [] }],
        activeSignature: 0,
        activeParameter: 0,
      };
    }
    const root = parseTemplate(text).root;
    const analysis = analyzeTemplate(root);
    const resolved =
      resolveAt(analysis, site.calleeOffset) ?? lookup(scopeAt(analysis.root, site.calleeOffset), site.callee);
    const macro = resolved !== null && resolved.kind === "Macro" ? findMacro(root, resolved.name) : findMacro(root, site.callee);
    if (macro === null || macro.name === null) {
      return null;
    }
    const label = renderSignature(text, macro);
    return {
      signatures: [
        {
          label,
          documentation: `Template macro with ${macro.params.length} parameter${macro.params.length === 1 ? "" : "s"}.`,
          parameters: macro.params.map((p) => ({ label: p.name })),
        },
      ],
      activeSignature: 0,
      activeParameter: Math.min(site.activeParameter, Math.max(0, macro.params.length - 1)),
    };
  } catch {
    return null;
  }
}

function renderSignature(text: string, macro: MacroNode): string {
  const params = macro.params.map((p) =>
    p.defaultValue === null ? p.name : `${p.name}=${text.slice(p.defaultValue.start, p.defaultValue.end)}`,
  );
  return `${macro.name ?? "macro"}(${params.join(", ")})`;
}

/** Innermost unclosed `name(` or `| name(` before the cursor. */
function callSite(text: string, at: number): CallSite | FilterSite | null {
  const tokens = lex(text).tokens;
  // Walk back from the cursor tracking paren depth over tokens ending by `at`.
  let depth = 0;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i];
    if (token === undefined || token.start >= at || token.kind === "EOF") {
      continue;
    }
    if (token.kind === "RParen" && token.end <= at) {
      depth++;
      continue;
    }
    if (token.kind === "LParen" && token.end <= at) {
      if (depth === 0) {
        return callCallee(tokens, i, at);
      }
      depth--;
      continue;
    }
  }
  return null;
}

/** Callee (or filter) for the argument list opened at `openIndex`. */
function callCallee(tokens: readonly Token[], openIndex: number, at: number): CallSite | FilterSite | null {
  const open = tokens[openIndex];
  if (open === undefined) {
    return null;
  }
  const prev = previousSignificant(tokens, openIndex);
  if (prev === null || (prev.kind !== "Identifier" && prev.kind !== "Keyword")) {
    return null;
  }
  // Filter form: `| name (`.
  const prevPrev = previousSignificant(tokens, tokens.indexOf(prev));
  if (prevPrev !== null && prevPrev.kind === "Pipe") {
    return { kind: "filter", name: prev.value };
  }
  // Method-style calls (`forms.input(`) need cross-file targets: later phase.
  if (prevPrev !== null && prevPrev.kind === "Dot") {
    return null;
  }
  return { kind: "call", callee: prev.value, calleeOffset: prev.start, activeParameter: countCommas(tokens, openIndex, at) };
}

/** Top-level commas between the paren (exclusive) and the cursor. */
function countCommas(tokens: readonly Token[], openIndex: number, at: number): number {
  let depth = 0;
  let commas = 0;
  for (let i = openIndex + 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined || token.start >= at || token.kind === "EOF") {
      break;
    }
    if (token.kind === "LParen" || token.kind === "LBracket" || token.kind === "LBrace") {
      depth++;
    } else if (token.kind === "RParen" || token.kind === "RBracket" || token.kind === "RBrace") {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0 && token.kind === "Comma") {
      commas++;
    }
  }
  return commas;
}


