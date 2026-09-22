import type { Range } from "../../types/index.js";
import type { Symbol } from "./symbols.js";

/**
 * Lexical scopes. Child scopes exist ONLY where Jinja introduces bindings
 * (for bodies, macro bodies, with bodies). If-blocks and plain blocks share
 * the enclosing scope because template variables leak through them.
 */
export type ScopeKind = "Template" | "For" | "Macro" | "With";

export interface Scope {
  readonly id: number;
  readonly kind: ScopeKind;
  readonly start: number;
  readonly end: number;
  readonly range: Range;
  readonly parent: Scope | null;
  readonly symbols: ReadonlyMap<string, Symbol>;
  readonly children: readonly Scope[];
}

export interface MutableScope {
  readonly id: number;
  readonly kind: ScopeKind;
  readonly start: number;
  end: number;
  range: Range;
  readonly parent: MutableScope | null;
  readonly symbols: Map<string, Symbol>;
  readonly children: MutableScope[];
}

export function createScope(
  id: number,
  kind: ScopeKind,
  start: number,
  end: number,
  range: Range,
  parent: MutableScope | null,
): MutableScope {
  const scope: MutableScope = { id, kind, start, end, range, parent, symbols: new Map(), children: [] };
  if (parent !== null) {
    parent.children.push(scope);
  }
  return scope;
}

/** Innermost scope wins. Walks parent chain; null when unresolvable. */
export function lookup(scope: Scope | null, name: string): Symbol | null {
  let current: Scope | null = scope;
  while (current !== null) {
    const found = current.symbols.get(name);
    if (found !== undefined) {
      return found;
    }
    current = current.parent;
  }
  return null;
}

/** Deepest scope whose span contains the offset, or null. */
export function scopeAt(root: Scope, offset: number): Scope | null {
  if (offset < root.start || offset > root.end) {
    return null;
  }
  for (const child of root.children) {
    const found = scopeAt(child, offset);
    if (found !== null) {
      return found;
    }
  }
  return root;
}
