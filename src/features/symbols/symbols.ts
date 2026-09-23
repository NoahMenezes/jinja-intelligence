import { SymbolKind, type DocumentSymbol, type SymbolInformation } from "vscode-languageserver/node.js";
import { analyzeTemplate } from "../../jinja/analysis/analyzer.js";
import type { Symbol, SymbolKind as AnalysisKind } from "../../jinja/analysis/symbols.js";
import { parseTemplate } from "../../jinja/parser/parser.js";
import type { TemplateIndex } from "../../project/template-index.js";

const KIND_MAP: Record<Exclude<AnalysisKind, "External">, (typeof SymbolKind)[keyof typeof SymbolKind]> = {
  Loop: SymbolKind.Variable,
  Set: SymbolKind.Variable,
  Macro: SymbolKind.Function,
  MacroParam: SymbolKind.Variable,
  Import: SymbolKind.Module,
  Block: SymbolKind.Struct,
  With: SymbolKind.Variable,
};

/**
 * Document outline from analysis symbols. Macro parameters nest under their
 * macro; everything else is top-level in document order. selectionRange
 * equals range (token-precise names unavailable — same approximation as
 * rename declarations). Total, never throws.
 */
export function documentSymbols(text: string): DocumentSymbol[] {
  try {
    const analysis = analyzeTemplate(parseTemplate(text).root);
    const out: DocumentSymbol[] = [];
    const macroChildren = new Map<string, DocumentSymbol[]>();
    for (const symbol of analysis.symbols) {
      if (symbol.kind === "MacroParam") {
        continue;
      }
      const item = toDocumentSymbol(symbol);
      if (item === null) {
        continue;
      }
      out.push(item);
      if (symbol.kind === "Macro") {
        macroChildren.set(symbol.name, paramsOf(analysis.symbols, symbol));
      }
    }
    for (const item of out) {
      if (item.kind === SymbolKind.Function) {
        const children = macroChildren.get(item.name);
        if (children !== undefined && children.length > 0) {
          item.children = children;
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

function paramsOf(symbols: readonly Symbol[], macro: Symbol): DocumentSymbol[] {
  // Params follow their macro in document order; collect until the next macro.
  const out: DocumentSymbol[] = [];
  let inside = false;
  for (const symbol of symbols) {
    if (symbol === macro) {
      inside = true;
      continue;
    }
    if (!inside) {
      continue;
    }
    if (symbol.kind === "Macro") {
      break;
    }
    if (symbol.kind === "MacroParam") {
      const item = toDocumentSymbol(symbol);
      if (item !== null) {
        out.push(item);
      }
    }
  }
  return out;
}

function toDocumentSymbol(symbol: Symbol): DocumentSymbol | null {
  if (symbol.kind === "External") {
    return null;
  }
  const kind = KIND_MAP[symbol.kind];
  if (kind === undefined) {
    return null;
  }
  return { name: symbol.name, kind, range: symbol.range, selectionRange: symbol.range };
}

/**
 * Single-file workspace search. Used as a fallback before the project index
 * has scanned; prefer indexWorkspaceSymbols once scanned.
 * Case-insensitive substring; empty query returns all. Total, never throws.
 */
export function workspaceSymbols(text: string, uri: string, query: string): SymbolInformation[] {
  try {
    const needle = query.toLowerCase();
    const out: SymbolInformation[] = [];
    for (const item of documentSymbols(text)) {
      if (needle.length > 0 && !item.name.toLowerCase().includes(needle)) {
        continue;
      }
      out.push({ name: item.name, kind: item.kind, location: { uri, range: item.range } });
      for (const child of item.children ?? []) {
        if (needle.length > 0 && !child.name.toLowerCase().includes(needle)) {
          continue;
        }
        out.push({ name: child.name, kind: child.kind, location: { uri, range: child.range } });
      }
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Index-wide workspace search across every indexed file: macros and blocks
 * whose names contain the query (case-insensitive; empty matches all).
 * Total, never throws.
 */
export function indexWorkspaceSymbols(index: TemplateIndex, query: string): SymbolInformation[] {
  try {
    const needle = query.toLowerCase();
    const matches = (name: string): boolean => needle.length === 0 || name.toLowerCase().includes(needle);
    const out: SymbolInformation[] = [];
    for (const uri of index.uris()) {
      const entry = index.get(uri);
      if (entry === null) {
        continue;
      }
      for (const macro of entry.macros) {
        if (matches(macro.name)) {
          out.push({ name: macro.name, kind: SymbolKind.Function, location: { uri, range: macro.range } });
        }
      }
      for (const block of entry.blocks) {
        if (matches(block.name)) {
          out.push({ name: block.name, kind: SymbolKind.Struct, location: { uri, range: block.range } });
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}
