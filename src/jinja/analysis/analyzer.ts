import type { Range } from "../../types/index.js";
import type {
  Expression,
  MacroParam,
  Statement,
  TemplateChild,
  TemplateNode,
  WithAssignment,
} from "../ast/nodes.js";
import { createScope, lookup, type MutableScope, type Scope } from "./scope.js";
import type { Symbol } from "./symbols.js";

/**
 * Scope and symbol analysis: which names are bound where, and what each
 * identifier occurrence resolves to. Pure, total, never throws.
 *
 * Intentional approximations (documented, refinable later):
 * - `set` is visible throughout its scope, even before the tag (flow-insensitive).
 * - Definition ranges are statement-level: the AST carries names as strings,
 *   so a Loop/Set/Macro name points at its statement, not the name token.
 *   Token-precise name ranges arrive with parser support in a later phase.
 * - `self`/`super` block references are not modeled (they resolve External).
 */

export interface Occurrence {
  readonly name: string;
  readonly start: number;
  readonly end: number;
  readonly range: Range;
  readonly scope: Scope;
}

export interface Analysis {
  readonly root: Scope;
  /** Every definition in document order. */
  readonly symbols: readonly Symbol[];
  /** Unresolved names, deduped in first-seen order (the template context surface). */
  readonly externals: readonly string[];
  /** Every reference-position identifier, for resolveAt and later phases. */
  readonly occurrences: readonly Occurrence[];
}

export function analyzeTemplate(root: TemplateNode): Analysis {
  const builder = new Analyzer(root);
  return builder.run();
}

/**
 * Resolve the identifier reference at the offset to its definition.
 * Only reference positions resolve (bases, callees, values); binding sites
 * such as for-targets and property segments return null. Later phases consult
 * `symbols` directly for definition-site behavior.
 */
export function resolveAt(analysis: Analysis, offset: number): Symbol | null {
  for (const occurrence of analysis.occurrences) {
    if (occurrence.start <= offset && offset <= occurrence.end) {
      return lookup(occurrence.scope, occurrence.name);
    }
  }
  return null;
}

class Analyzer {
  private nextId = 0;
  private readonly symbols: Symbol[] = [];
  private readonly occurrences: Occurrence[] = [];
  private readonly externalSet = new Set<string>();
  private readonly externals: string[] = [];

  constructor(private readonly root: TemplateNode) {}

  run(): Analysis {
    const rootScope = this.scope("Template", this.root.start, this.root.end, this.root.range, null);
    this.children(this.root.children, rootScope);
    for (const occurrence of this.occurrences) {
      if (lookup(occurrence.scope, occurrence.name) === null && !this.externalSet.has(occurrence.name)) {
        this.externalSet.add(occurrence.name);
        this.externals.push(occurrence.name);
      }
    }
    return { root: rootScope, symbols: this.symbols, externals: this.externals, occurrences: this.occurrences };
  }

  private scope(kind: "Template" | "For" | "Macro" | "With", start: number, end: number, range: Range, parent: MutableScope | null): MutableScope {
    return createScope(this.nextId++, kind, start, end, range, parent);
  }

  private define(scope: MutableScope, name: string | null, kind: Symbol["kind"], at: { start: number; end: number; range: Range }): void {
    if (name === null || name.length === 0) {
      return;
    }
    const symbol: Symbol = { name, kind, start: at.start, end: at.end, range: at.range };
    scope.symbols.set(name, symbol);
    this.symbols.push(symbol);
  }

  private refer(scope: MutableScope, name: string, at: { start: number; end: number; range: Range }): void {
    this.occurrences.push({ name, start: at.start, end: at.end, range: at.range, scope });
  }

  private children(children: readonly TemplateChild[], scope: MutableScope): void {
    for (const child of children) {
      this.child(child, scope);
    }
  }

  private child(child: TemplateChild, scope: MutableScope): void {
    switch (child.kind) {
      case "Text":
      case "Comment":
      case "RawStatement":
        return;
      case "Output":
        this.expression(child.expr, scope);
        return;
      default:
        this.statement(child, scope);
        return;
    }
  }

  private statement(node: Statement, scope: MutableScope): void {
    switch (node.kind) {
      case "If": {
        this.expression(node.condition, scope);
        this.children(node.body, scope);
        for (const elif of node.elifs) {
          this.expression(elif.condition, scope);
          this.children(elif.body, scope);
        }
        if (node.elseBody !== null) {
          this.children(node.elseBody, scope);
        }
        return;
      }
      case "For": {
        this.expression(node.iterable, scope);
        const body = this.scope("For", node.start, node.end, node.range, scope);
        for (const target of node.targets) {
          this.define(body, target, "Loop", node);
        }
        this.define(body, "loop", "Loop", node);
        this.children(node.body, body);
        if (node.elseBody !== null) {
          this.children(node.elseBody, body);
        }
        return;
      }
      case "Set": {
        if (node.value !== null) {
          this.expression(node.value, scope);
        }
        this.define(scope, node.target, "Set", node);
        if (node.body !== null) {
          this.children(node.body, scope);
        }
        return;
      }
      case "Block": {
        this.define(scope, node.name, "Block", node);
        this.children(node.body, scope);
        return;
      }
      case "Extends": {
        if (node.parent !== null) {
          this.expression(node.parent, scope);
        }
        return;
      }
      case "Include": {
        if (node.template !== null) {
          this.expression(node.template, scope);
        }
        return;
      }
      case "Import": {
        if (node.template !== null) {
          this.expression(node.template, scope);
        }
        this.define(scope, node.alias, "Import", node);
        return;
      }
      case "From": {
        if (node.template !== null) {
          this.expression(node.template, scope);
        }
        for (const name of node.names) {
          this.define(scope, name.alias ?? name.name, "Import", node);
        }
        return;
      }
      case "Macro": {
        this.define(scope, node.name, "Macro", node);
        const body = this.scope("Macro", node.start, node.end, node.range, scope);
        for (const param of node.params) {
          this.param(param, body);
        }
        this.children(node.body, body);
        return;
      }
      case "CallBlock": {
        if (node.callee !== null) {
          this.expression(node.callee, scope);
        }
        for (const arg of node.args) {
          this.expression(arg.value, scope);
        }
        this.children(node.body, scope);
        return;
      }
      case "FilterBlock": {
        for (const arg of node.args) {
          this.expression(arg.value, scope);
        }
        this.children(node.body, scope);
        return;
      }
      case "With": {
        const body = this.scope("With", node.start, node.end, node.range, scope);
        for (const assignment of node.assignments) {
          this.withAssignment(assignment, scope, body);
        }
        this.children(node.body, body);
        return;
      }
      case "RawBlock":
      case "Do": {
        if (node.kind === "Do" && node.expr !== null) {
          this.expression(node.expr, scope);
        }
        return;
      }
    }
  }

  private param(param: MacroParam, scope: MutableScope): void {
    this.define(scope, param.name, "MacroParam", scope);
    if (param.defaultValue !== null) {
      this.expression(param.defaultValue, scope);
    }
  }

  private withAssignment(assignment: WithAssignment, outer: MutableScope, body: MutableScope): void {
    // Values evaluate in the enclosing scope; names bind in the body scope.
    if (assignment.value !== null) {
      this.expression(assignment.value, outer);
    }
    this.define(body, assignment.name, "With", body);
  }

  private expression(expr: Expression, scope: MutableScope): void {
    switch (expr.kind) {
      case "Identifier":
        this.refer(scope, expr.name, expr);
        return;
      case "PropertyAccess":
        this.expression(expr.object, scope);
        return;
      case "IndexAccess":
        this.expression(expr.object, scope);
        if (expr.index !== null) {
          this.expression(expr.index, scope);
        }
        return;
      case "Call":
        this.expression(expr.callee, scope);
        for (const arg of expr.args) {
          this.expression(arg.value, scope);
        }
        return;
      case "Filter":
        this.expression(expr.target, scope);
        for (const arg of expr.args) {
          this.expression(arg.value, scope);
        }
        return;
      case "Test":
        this.expression(expr.target, scope);
        for (const arg of expr.args) {
          this.expression(arg.value, scope);
        }
        return;
      case "Unary":
        this.expression(expr.operand, scope);
        return;
      case "Binary":
        this.expression(expr.left, scope);
        this.expression(expr.right, scope);
        return;
      case "Compare":
        this.expression(expr.left, scope);
        for (const clause of expr.rest) {
          this.expression(clause.right, scope);
        }
        return;
      case "Logical":
        this.expression(expr.left, scope);
        this.expression(expr.right, scope);
        return;
      case "Conditional":
        this.expression(expr.consequent, scope);
        this.expression(expr.condition, scope);
        if (expr.alternate !== null) {
          this.expression(expr.alternate, scope);
        }
        return;
      case "ListLiteral":
      case "TupleLiteral":
        for (const element of expr.elements) {
          this.expression(element, scope);
        }
        return;
      case "DictLiteral":
        for (const entry of expr.entries) {
          this.expression(entry.key, scope);
          if (entry.value !== null) {
            this.expression(entry.value, scope);
          }
        }
        return;
      case "Group":
        this.expression(expr.expr, scope);
        return;
      case "StringLiteral":
      case "NumberLiteral":
      case "BooleanLiteral":
      case "NoneLiteral":
      case "Invalid":
        return;
    }
  }
}
