import { CompletionItemKind, type CompletionItem } from "vscode-languageserver/node.js";
import { resolveAt, type Analysis } from "../../jinja/analysis/analyzer.js";
import { scopeAt } from "../../jinja/analysis/scope.js";
import { LOOP_ATTRIBUTES, type SymbolKind } from "../../jinja/analysis/symbols.js";
import { buildBuiltinItems } from "./providers.js";

const SCOPE_DETAILS: Record<Exclude<SymbolKind, "Block" | "External">, string> = {
  Loop: "loop variable",
  Set: "set variable",
  Macro: "macro",
  MacroParam: "macro parameter",
  Import: "import",
  With: "with variable",
};

function scopeKindOf(kind: SymbolKind): CompletionItem["kind"] {
  switch (kind) {
    case "Macro":
      return CompletionItemKind.Function;
    case "Import":
      return CompletionItemKind.Module;
    case "Loop":
    case "Set":
    case "MacroParam":
    case "With":
      return CompletionItemKind.Variable;
    case "Block":
    case "External":
      return undefined;
  }
}

/**
 * Scope-aware variable completion: innermost bindings first, then builtins,
 * then names seen in the file context. Total, never throws.
 */
export function buildVariableItems(analysis: Analysis, offset: number): CompletionItem[] {
  try {
    const items: CompletionItem[] = [];
    const seen = new Set<string>();
    let scope = scopeAt(analysis.root, offset);
    while (scope !== null) {
      for (const symbol of scope.symbols.values()) {
        if (seen.has(symbol.name)) {
          continue;
        }
        const kind = scopeKindOf(symbol.kind);
        if (kind === undefined) {
          continue;
        }
        const detail = SCOPE_DETAILS[symbol.kind as keyof typeof SCOPE_DETAILS];
        if (detail === undefined) {
          continue;
        }
        seen.add(symbol.name);
        items.push({ label: symbol.name, kind, detail, sortText: `0${symbol.name}` });
      }
      scope = scope.parent;
    }
    for (const item of buildBuiltinItems(seen)) {
      items.push(item);
      seen.add(item.label);
    }
    for (const name of analysis.externals) {
      if (seen.has(name)) {
        continue;
      }
      seen.add(name);
      items.push({ label: name, kind: CompletionItemKind.Variable, detail: "context", sortText: `2${name}` });
    }
    return items;
  } catch {
    return [];
  }
}

/**
 * Property completion. Only the implicit `loop` variable has known
 * attributes today; every other base yields no items (type-driven
 * properties arrive with Python type intelligence).
 */
export function buildPropertyItems(analysis: Analysis, baseName: string, baseOffset: number): CompletionItem[] {
  try {
    const resolved = resolveAt(analysis, baseOffset);
    if (resolved === null || resolved.name !== baseName || resolved.name !== "loop" || resolved.kind !== "Loop") {
      return [];
    }
    return [...LOOP_ATTRIBUTES]
      .sort()
      .map((label) => ({ label, kind: CompletionItemKind.Field, detail: "loop attribute", sortText: label }));
  } catch {
    return [];
  }
}
