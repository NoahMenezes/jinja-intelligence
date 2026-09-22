import type { Range } from "../../types/index.js";

/** Base for every AST node. Offsets are UTF-16 code units into the source text. */
export interface BaseNode {
  readonly kind: string;
  readonly start: number;
  readonly end: number;
  readonly range: Range;
}

export interface TemplateNode extends BaseNode {
  readonly kind: "Template";
  readonly children: readonly TemplateChild[];
}

export type TemplateChild = TextNode | OutputNode | CommentNode | Statement | RawStatementNode;

/**
 * Block-level statements. Every node retains exact source offsets so
 * diagnostics, navigation, and rename can map back to the document.
 */
export type Statement =
  | IfNode
  | ForNode
  | SetNode
  | BlockNode
  | ExtendsNode
  | IncludeNode
  | ImportNode
  | FromNode
  | MacroNode
  | CallBlockNode
  | FilterBlockNode
  | WithNode
  | RawBlockNode
  | DoNode;

export interface TextNode extends BaseNode {
  readonly kind: "Text";
  readonly value: string;
}

export interface OutputNode extends BaseNode {
  readonly kind: "Output";
  readonly expr: Expression;
}

export interface CommentNode extends BaseNode {
  readonly kind: "Comment";
  readonly value: string;
}

/**
 * Opaque {% ... %} tag: unknown statements and stray end tags.
 * Phase 5 produced these for every block tag; Phase 6 refines known tags
 * into Statement nodes and keeps this for the rest. Exact source preserved.
 */
export interface RawStatementNode extends BaseNode {
  readonly kind: "RawStatement";
  readonly value: string;
}

export interface ElifBranch {
  readonly condition: Expression;
  readonly body: readonly TemplateChild[];
}

export interface IfNode extends BaseNode {
  readonly kind: "If";
  readonly condition: Expression;
  readonly body: readonly TemplateChild[];
  readonly elifs: readonly ElifBranch[];
  readonly elseBody: readonly TemplateChild[] | null;
}

export interface ForNode extends BaseNode {
  readonly kind: "For";
  readonly targets: readonly string[];
  readonly iterable: Expression;
  readonly body: readonly TemplateChild[];
  readonly elseBody: readonly TemplateChild[] | null;
  readonly recursive: boolean;
}

export interface SetNode extends BaseNode {
  readonly kind: "Set";
  /** Null when the target is missing (truncated tag). */
  readonly target: string | null;
  /** Assigned value for `{% set x = ... %}`; null for block-set or truncated tags. */
  readonly value: Expression | null;
  /** Body for `{% set x %}...{% endset %}`; null for value-set. */
  readonly body: readonly TemplateChild[] | null;
  readonly namespaceAttribute: string | null;
}

export interface BlockNode extends BaseNode {
  readonly kind: "Block";
  /** Null when the block name is missing. */
  readonly name: string | null;
  readonly body: readonly TemplateChild[];
  readonly scoped: boolean;
}

export interface ExtendsNode extends BaseNode {
  readonly kind: "Extends";
  /** Null when the parent expression is missing. */
  readonly parent: Expression | null;
}

export interface IncludeNode extends BaseNode {
  readonly kind: "Include";
  /** Null when the template expression is missing. */
  readonly template: Expression | null;
  readonly ignoreMissing: boolean;
  readonly withoutContext: boolean;
  readonly withContext: boolean;
}

export interface ImportNode extends BaseNode {
  readonly kind: "Import";
  /** Null when the template expression is missing. */
  readonly template: Expression | null;
  /** Null when the alias is missing. */
  readonly alias: string | null;
}

export interface ImportName {
  readonly name: string;
  /** Null when there is no `as` alias. */
  readonly alias: string | null;
}

export interface FromNode extends BaseNode {
  readonly kind: "From";
  /** Null when the template expression is missing. */
  readonly template: Expression | null;
  readonly names: readonly ImportName[];
}

export interface MacroParam {
  readonly name: string;
  readonly defaultValue: Expression | null;
}

export interface MacroNode extends BaseNode {
  readonly kind: "Macro";
  /** Null when the macro name is missing. */
  readonly name: string | null;
  readonly params: readonly MacroParam[];
  readonly body: readonly TemplateChild[];
}

export interface CallBlockNode extends BaseNode {
  readonly kind: "CallBlock";
  /** Null when the callee is missing. */
  readonly callee: Expression | null;
  readonly args: readonly CallArgument[];
  readonly body: readonly TemplateChild[];
}

export interface FilterBlockNode extends BaseNode {
  readonly kind: "FilterBlock";
  /** Null when the filter name is missing. */
  readonly name: string | null;
  readonly args: readonly CallArgument[];
  readonly body: readonly TemplateChild[];
}

export interface WithAssignment {
  readonly name: string;
  readonly value: Expression | null;
}

export interface WithNode extends BaseNode {
  readonly kind: "With";
  readonly assignments: readonly WithAssignment[];
  readonly body: readonly TemplateChild[];
  readonly withoutContext: boolean;
}

export interface RawBlockNode extends BaseNode {
  readonly kind: "RawBlock";
  /** Inner source preserved verbatim as text. */
  readonly body: readonly TextNode[];
}

export interface DoNode extends BaseNode {
  readonly kind: "Do";
  /** Null when the expression is missing (truncated tag). */
  readonly expr: Expression | null;
}

export type Expression =
  | IdentifierNode
  | StringLiteralNode
  | NumberLiteralNode
  | BooleanLiteralNode
  | NoneLiteralNode
  | PropertyAccessNode
  | IndexAccessNode
  | CallNode
  | FilterNode
  | TestNode
  | UnaryNode
  | BinaryNode
  | CompareNode
  | LogicalNode
  | ConditionalNode
  | ListLiteralNode
  | TupleLiteralNode
  | DictLiteralNode
  | GroupNode
  | InvalidNode;

export interface IdentifierNode extends BaseNode {
  readonly kind: "Identifier";
  readonly name: string;
}

export interface StringLiteralNode extends BaseNode {
  readonly kind: "StringLiteral";
  /** Raw token text including quotes. */
  readonly value: string;
}

export interface NumberLiteralNode extends BaseNode {
  readonly kind: "NumberLiteral";
  readonly value: number;
  readonly raw: string;
}

export interface BooleanLiteralNode extends BaseNode {
  readonly kind: "BooleanLiteral";
  readonly value: boolean;
}

export interface NoneLiteralNode extends BaseNode {
  readonly kind: "NoneLiteral";
}

export interface PropertyAccessNode extends BaseNode {
  readonly kind: "PropertyAccess";
  readonly object: Expression;
  /** Null when the property name is missing (e.g. `{{ user. }}`). */
  readonly property: string | null;
}

export interface IndexAccessNode extends BaseNode {
  readonly kind: "IndexAccess";
  readonly object: Expression;
  /** Null when the index is missing (e.g. `{{ a[ }}`). */
  readonly index: Expression | null;
}

export interface CallArgument {
  readonly name: string | null;
  readonly value: Expression;
}

export interface CallNode extends BaseNode {
  readonly kind: "Call";
  readonly callee: Expression;
  readonly args: readonly CallArgument[];
}

export interface FilterNode extends BaseNode {
  readonly kind: "Filter";
  readonly target: Expression;
  /** Null when the filter name is missing (e.g. `{{ x | }}`). */
  readonly name: string | null;
  readonly args: readonly CallArgument[];
}

export interface TestNode extends BaseNode {
  readonly kind: "Test";
  readonly target: Expression;
  /** Null when the test name is missing. */
  readonly name: string | null;
  readonly negated: boolean;
  readonly args: readonly CallArgument[];
}

export interface UnaryNode extends BaseNode {
  readonly kind: "Unary";
  readonly op: string;
  readonly operand: Expression;
}

export interface BinaryNode extends BaseNode {
  readonly kind: "Binary";
  readonly op: string;
  readonly left: Expression;
  readonly right: Expression;
}

export interface CompareClause {
  readonly op: string;
  readonly right: Expression;
}

export interface CompareNode extends BaseNode {
  readonly kind: "Compare";
  readonly left: Expression;
  /** Chained comparisons: `a < b <= c` yields two clauses. */
  readonly rest: readonly CompareClause[];
}

export interface LogicalNode extends BaseNode {
  readonly kind: "Logical";
  readonly op: "and" | "or";
  readonly left: Expression;
  readonly right: Expression;
}

export interface ConditionalNode extends BaseNode {
  readonly kind: "Conditional";
  readonly consequent: Expression;
  readonly condition: Expression;
  /** Null when the else branch is missing (typing state). */
  readonly alternate: Expression | null;
}

export interface ListLiteralNode extends BaseNode {
  readonly kind: "ListLiteral";
  readonly elements: readonly Expression[];
}

export interface TupleLiteralNode extends BaseNode {
  readonly kind: "TupleLiteral";
  readonly elements: readonly Expression[];
}

export interface DictEntry {
  readonly key: Expression;
  readonly value: Expression | null;
}

export interface DictLiteralNode extends BaseNode {
  readonly kind: "DictLiteral";
  readonly entries: readonly DictEntry[];
}

export interface GroupNode extends BaseNode {
  readonly kind: "Group";
  readonly expr: Expression;
}

/** Recovery placeholder for unparseable fragments. Always carries an error. */
export interface InvalidNode extends BaseNode {
  readonly kind: "Invalid";
  readonly reason: string;
}
