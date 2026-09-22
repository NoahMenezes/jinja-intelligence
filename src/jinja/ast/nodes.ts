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

export type TemplateChild = TextNode | OutputNode | CommentNode | RawStatementNode;

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
 * Opaque {% ... %} tag. Phase 5 preserves exact source without assigning
 * meaning; Phase 6 refines these into statement nodes.
 */
export interface RawStatementNode extends BaseNode {
  readonly kind: "RawStatement";
  readonly value: string;
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
