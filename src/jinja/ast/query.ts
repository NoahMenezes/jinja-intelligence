import type {
  Expression,
  MacroNode,
  Statement,
  StringLiteralNode,
  TemplateChild,
  TemplateNode,
} from "./nodes.js";

/** A string literal used as a template reference, with its owning statement. */
export interface TemplateReference {
  readonly statement: Statement;
  readonly expr: StringLiteralNode;
}

/**
 * Shared AST queries for navigation features. Pure, total, never throws.
 * Phase 14 (references/rename) builds on these same walkers.
 */

/** Collect extends/include/import/from template path literals. */
export function templateReferences(root: TemplateNode): TemplateReference[] {
  const out: TemplateReference[] = [];
  try {
    walk(root.children, (node) => {
      if (node.kind === "Extends") {
        if (node.parent !== null && node.parent.kind === "StringLiteral") {
          out.push({ statement: node, expr: node.parent });
        }
      } else if (node.kind === "Include" || node.kind === "Import" || node.kind === "From") {
        if (node.template !== null && node.template.kind === "StringLiteral") {
          out.push({ statement: node, expr: node.template });
        }
      }
    });
  } catch {
    // Partial results are still useful.
  }
  return out;
}

/** Find a macro definition by name, innermost match wins. */
export function findMacro(root: TemplateNode, name: string): MacroNode | null {
  let found: MacroNode | null = null;
  try {
    walk(root.children, (node) => {
      if (node.kind === "Macro" && node.name === name && found === null) {
        found = node;
      }
    });
  } catch {
    // ignore
  }
  return found;
}

/** Unquote a string literal value. Returns null for non-literals or empty paths. */
export function unquote(expr: Expression | null): string | null {
  if (expr === null || expr.kind !== "StringLiteral") {
    return null;
  }
  const raw = expr.value;
  if (raw.length >= 2) {
    const first = raw[0];
    const last = raw[raw.length - 1];
    if ((first === '"' || first === "'") && first === last) {
      const inner = raw.slice(1, -1);
      return inner.trim().length === 0 ? null : inner;
    }
  }
  return raw.trim().length === 0 ? null : raw;
}

function walk(children: readonly TemplateChild[], visit: (node: Statement) => void): void {
  for (const child of children) {
    if (child.kind === "Text" || child.kind === "Output" || child.kind === "Comment" || child.kind === "RawStatement") {
      continue;
    }
    visit(child);
    for (const nested of bodies(child)) {
      walk(nested, visit);
    }
  }
}

/** Visit every statement in a template, innermost included. Shared by navigation features. */
export function walkStatements(children: readonly TemplateChild[], visit: (node: Statement) => void): void {
  walk(children, visit);
}

function bodies(node: Statement): readonly (readonly TemplateChild[])[] {
  switch (node.kind) {
    case "If":
      return [node.body, ...node.elifs.map((e) => e.body), ...(node.elseBody === null ? [] : [node.elseBody])];
    case "For":
      return [node.body, ...(node.elseBody === null ? [] : [node.elseBody])];
    case "Set":
      return node.body === null ? [] : [node.body];
    case "Block":
    case "Macro":
    case "CallBlock":
    case "FilterBlock":
    case "With":
      return [node.body];
    case "Extends":
    case "Include":
    case "Import":
    case "From":
    case "RawBlock":
    case "Do":
      return [];
  }
}
