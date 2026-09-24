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
 * then template context. Python-provided names outrank file-guessed
 * externals; both carry `detail: "context"` with provenance intact.
 * Total, never throws.
 */
export function buildVariableItems(
  analysis: Analysis,
  offset: number,
  pythonNames?: readonly string[],
  typeNames?: Readonly<Record<string, string>>,
): CompletionItem[] {
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
    for (const name of pythonNames ?? []) {
      if (seen.has(name)) {
        continue;
      }
      seen.add(name);
      const typeName = typeNames?.[name];
      items.push({
        label: name,
        kind: CompletionItemKind.Variable,
        detail: typeName === undefined || typeName === "unknown" ? "context" : `context · ${typeName}`,
        sortText: `2${name}`,
      });
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
 * Property completion: the implicit `loop` variable first, then type-driven
 * attributes for Python-typed bases. Unknown bases yield nothing (never
 * fiction). Total, never throws.
 */
export function buildPropertyItems(
  analysis: Analysis,
  baseName: string,
  baseOffset: number,
  typeAttrs?: readonly string[],
): CompletionItem[] {
  try {
    const resolved = resolveAt(analysis, baseOffset);
    if (resolved !== null && resolved.name === baseName && resolved.name === "loop" && resolved.kind === "Loop") {
      return [...LOOP_ATTRIBUTES]
        .sort()
        .map((label) => ({ label, kind: CompletionItemKind.Field, detail: "loop attribute", sortText: label }));
    }
    if (resolved !== null && resolved.name === baseName) {
      // Locally bound: shadowing context names carry no type info yet.
      return [];
    }
    if (typeAttrs !== undefined && typeAttrs.length > 0) {
      return [...typeAttrs]
        .sort()
        .map((label) => ({ label, kind: CompletionItemKind.Field, detail: `${baseName} attribute`, sortText: label }));
    }
    return [];
  } catch {
    return [];
  }
}
