import type { Token } from "../lexer/token-types.js";
import type {
  BinaryNode,
  CallArgument,
  CallNode,
  CompareClause,
  CompareNode,
  ConditionalNode,
  DictEntry,
  DictLiteralNode,
  Expression,
  FilterNode,
  GroupNode,
  IdentifierNode,
  IndexAccessNode,
  InvalidNode,
  ListLiteralNode,
  LogicalNode,
  PropertyAccessNode,
  TestNode,
  TupleLiteralNode,
  UnaryNode,
} from "../ast/nodes.js";
import type { ParseError, ParseErrorCode } from "./parser-errors.js";

/**
 * Pratt-style (precedence-climbing) Jinja expression parser.
 * Operates on the token slice inside a {{ }} tag plus a synthetic EOF.
 * Total: always returns an Expression, recording errors instead of throwing.
 *
 * Precedence (low -> high):
 * conditional -> or -> and -> not -> comparison/in -> concat/add -> mul ->
 * unary -> postfix (. [] () |filter is-test) -> primary
 */

export interface StreamOptions {
  /** Whether the enclosing tag had its closing delimiter. */
  readonly closed: boolean;
}

export class TokenStream {
  private pos = 0;
  constructor(
    readonly tokens: readonly Token[],
    readonly errors: ParseError[],
    readonly options: StreamOptions,
  ) {}

  peek(offset = 0): Token {
    const token = this.tokens[this.pos + offset];
    if (token !== undefined) {
      return token;
    }
    const last = this.tokens[this.tokens.length - 1];
    if (last !== undefined) {
      return last;
    }
    throw new Error("TokenStream requires at least an EOF token.");
  }

  consume(): Token {
    const token = this.peek();
    if (this.pos < this.tokens.length - 1) {
      this.pos++;
    }
    return token;
  }

  matchKeyword(word: string): Token | null {
    const token = this.peek();
    if (token.kind === "Keyword" && token.value === word) {
      return this.consume();
    }
    return null;
  }

  matchKind(kind: Token["kind"]): Token | null {
    const token = this.peek();
    if (token.kind === kind) {
      return this.consume();
    }
    return null;
  }

  matchOperator(op: string): Token | null {
    const token = this.peek();
    if (token.kind === "Operator" && token.value === op) {
      return this.consume();
    }
    return null;
  }

  /** Missing-operand error; distinguishes typing (open tag) from truncated tags. */
  missing(at: Token, what: string): void {
    const truncated = !this.options.closed && at.kind === "EOF";
    this.push(truncated ? "unterminated-expression" : "expected-expression", `Expected ${what}.`, at);
  }

  push(code: ParseErrorCode, message: string, at: Token): void {
    this.errors.push({ code, message, start: at.start, end: at.end, range: at.range });
  }

  get done(): boolean {
    return this.peek().kind === "EOF";
  }
}

function merge(a: { start: number; end: number; range: Expression["range"] }, b: { start: number; end: number; range: Expression["range"] }): {
  start: number;
  end: number;
  range: Expression["range"];
} {
  return { start: a.start, end: b.end, range: { start: a.range.start, end: b.range.end } };
}

function invalid(stream: TokenStream, reason: string): InvalidNode {
  const at = stream.peek();
  stream.missing(at, "an expression");
  return { kind: "Invalid", reason, start: at.start, end: at.end, range: at.range };
}

/** Entry point: parse one expression (conditional level). */
export function parseExpression(stream: TokenStream): Expression {
  const consequent = parseOr(stream);
  if (stream.matchKeyword("if") === null) {
    return consequent;
  }
  const condition = parseOr(stream);
  if (stream.matchKeyword("else") === null) {
    const at = stream.peek();
    stream.push("expected-expression", "Expected 'else' in conditional expression.", at);
    return { kind: "Conditional", consequent, condition, alternate: null, ...merge(consequent, condition) };
  }
  const alternate = parseExpression(stream);
  return { kind: "Conditional", consequent, condition, alternate, ...merge(consequent, alternate) };
}

function parseOr(stream: TokenStream): Expression {
  let left = parseAnd(stream);
  for (;;) {
    const op = stream.matchKeyword("or");
    if (op === null) {
      return left;
    }
    const right = parseAnd(stream);
    const node: LogicalNode = { kind: "Logical", op: "or", left, right, ...merge(left, right) };
    left = node;
  }
}

function parseAnd(stream: TokenStream): Expression {
  let left = parseNot(stream);
  for (;;) {
    const op = stream.matchKeyword("and");
    if (op === null) {
      return left;
    }
    const right = parseNot(stream);
    const node: LogicalNode = { kind: "Logical", op: "and", left, right, ...merge(left, right) };
    left = node;
  }
}

function parseNot(stream: TokenStream): Expression {
  const op = stream.matchKeyword("not");
  if (op === null) {
    return parseComparison(stream);
  }
  const operand = parseNot(stream);
  const node: UnaryNode = { kind: "Unary", op: "not", operand, start: op.start, end: operand.end, range: { start: op.range.start, end: operand.range.end } };
  return node;
}

const COMPARE_OPS = new Set(["==", "!=", "<", "<=", ">", ">="]);

function parseComparison(stream: TokenStream): Expression {
  const left = parseConcat(stream);
  const rest: CompareClause[] = [];
  for (;;) {
    const next = stream.peek();
    // `not in` form: `x not in y`.
    if (next.kind === "Keyword" && next.value === "not") {
      const after = stream.peek(1);
      if (after.kind === "Keyword" && after.value === "in") {
        stream.consume();
        stream.consume();
        rest.push({ op: "not in", right: parseConcat(stream) });
        continue;
      }
      return finishCompare(left, rest);
    }
    if (next.kind === "Keyword" && next.value === "in") {
      stream.consume();
      rest.push({ op: "in", right: parseConcat(stream) });
      continue;
    }
    if (next.kind === "Operator" && COMPARE_OPS.has(next.value)) {
      stream.consume();
      rest.push({ op: next.value, right: parseConcat(stream) });
      continue;
    }
    return finishCompare(left, rest);
  }
}

function finishCompare(left: Expression, rest: readonly CompareClause[]): Expression {
  if (rest.length === 0) {
    return left;
  }
  const last = rest[rest.length - 1];
  if (last === undefined) {
    return left;
  }
  const node: CompareNode = { kind: "Compare", left, rest, ...merge(left, last.right) };
  return node;
}

function parseConcat(stream: TokenStream): Expression {
  let left = parseAdd(stream);
  for (;;) {
    const t = stream.peek();
    const isConcat =
      (t.kind === "Tilde" || t.kind === "Operator") && t.value === "~";
    if (!isConcat) {
      return left;
    }
    stream.consume();
    const right = parseAdd(stream);
    const node: BinaryNode = { kind: "Binary", op: "~", left, right, ...merge(left, right) };
    left = node;
  }
}

function parseAdd(stream: TokenStream): Expression {
  let left = parseMul(stream);
  for (;;) {
    const t = stream.peek();
    if ((t.kind === "Operator" && (t.value === "+" || t.value === "-")) || t.kind === "Tilde") {
      if (t.kind === "Tilde") {
        return left;
      }
      const op = t.value;
      stream.consume();
      const right = parseMul(stream);
      const node: BinaryNode = { kind: "Binary", op, left, right, ...merge(left, right) };
      left = node;
      continue;
    }
    return left;
  }
}

function parseMul(stream: TokenStream): Expression {
  let left = parseUnary(stream);
  for (;;) {
    const t = stream.peek();
    if (t.kind === "Operator" && (t.value === "*" || t.value === "/" || t.value === "//" || t.value === "%" || t.value === "**")) {
      const op = t.value;
      stream.consume();
      const right = parseUnary(stream);
      const node: BinaryNode = { kind: "Binary", op, left, right, ...merge(left, right) };
      left = node;
      continue;
    }
    return left;
  }
}

function parseUnary(stream: TokenStream): Expression {
  const t = stream.peek();
  if (t.kind === "Operator" && (t.value === "-" || t.value === "+")) {
    stream.consume();
    const operand = parseUnary(stream);
    const node: UnaryNode = { kind: "Unary", op: t.value, operand, start: t.start, end: operand.end, range: { start: t.range.start, end: operand.range.end } };
    return node;
  }
  return parsePostfix(stream);
}

function parsePostfix(stream: TokenStream): Expression {
  let base = parsePrimary(stream);
  for (;;) {
    const t = stream.peek();
    if (t.kind === "Dot") {
      stream.consume();
      const name = stream.peek();
      if (name.kind === "Identifier" || name.kind === "Keyword") {
        stream.consume();
        const node: PropertyAccessNode = {
          kind: "PropertyAccess",
          object: base,
          property: name.value,
          ...merge(base, name),
        };
        base = node;
      } else {
        stream.push("expected-property", "Expected a property name after '.'.", name);
        const node: PropertyAccessNode = { kind: "PropertyAccess", object: base, property: null, start: base.start, end: t.end, range: { start: base.range.start, end: t.range.end } };
        base = node;
      }
      continue;
    }
    if (t.kind === "LBracket") {
      stream.consume();
      if (stream.peek().kind === "RBracket") {
        const close = stream.consume();
        const node: IndexAccessNode = { kind: "IndexAccess", object: base, index: null, ...merge(base, close) };
        stream.push("expected-expression", "Expected an index inside '[ ]'.", close);
        base = node;
        continue;
      }
      const index = parseExpression(stream);
      const close = stream.peek();
      if (close.kind === "RBracket") {
        stream.consume();
        const node: IndexAccessNode = { kind: "IndexAccess", object: base, index, ...merge(base, close) };
        base = node;
      } else {
        stream.push("expected-close", "Expected ']' to close the index.", close);
        const node: IndexAccessNode = { kind: "IndexAccess", object: base, index, start: base.start, end: index.end, range: { start: base.range.start, end: index.range.end } };
        base = node;
      }
      continue;
    }
    if (t.kind === "LParen") {
      const call = parseCallArgs(stream, base);
      base = call;
      continue;
    }
    if (t.kind === "Pipe") {
      stream.consume();
      const nameToken = stream.peek();
      if (nameToken.kind !== "Identifier" && nameToken.kind !== "Keyword") {
        stream.push("expected-expression", "Expected a filter name after '|'.", nameToken);
        const node: FilterNode = { kind: "Filter", target: base, name: null, args: [], start: base.start, end: t.end, range: { start: base.range.start, end: t.range.end } };
        base = node;
        continue;
      }
      stream.consume();
      let args: readonly CallArgument[] = [];
      let end = nameToken.end;
      let endRange = nameToken.range.end;
      if (stream.peek().kind === "LParen") {
        const parsed = parseParenArgs(stream);
        args = parsed.args;
        end = parsed.end;
        endRange = parsed.endRange;
      }
      const node: FilterNode = {
        kind: "Filter",
        target: base,
        name: nameToken.value,
        args,
        start: base.start,
        end,
        range: { start: base.range.start, end: endRange },
      };
      base = node;
      continue;
    }
    if (t.kind === "Keyword" && t.value === "is") {
      stream.consume();
      let negated = false;
      if (stream.matchKeyword("not") !== null) {
        negated = true;
      }
      const nameToken = stream.peek();
      if (nameToken.kind !== "Identifier" && nameToken.kind !== "Keyword") {
        stream.push("expected-expression", "Expected a test name after 'is'.", nameToken);
        const node: TestNode = { kind: "Test", target: base, name: null, negated, args: [], start: base.start, end: t.end, range: { start: base.range.start, end: t.range.end } };
        base = node;
        continue;
      }
      stream.consume();
      let args: readonly CallArgument[] = [];
      let end = nameToken.end;
      let endRange = nameToken.range.end;
      if (stream.peek().kind === "LParen") {
        const parsed = parseParenArgs(stream);
        args = parsed.args;
        end = parsed.end;
        endRange = parsed.endRange;
      }
      const node: TestNode = {
        kind: "Test",
        target: base,
        name: nameToken.value,
        negated,
        args,
        start: base.start,
        end,
        range: { start: base.range.start, end: endRange },
      };
      base = node;
      continue;
    }
    return base;
  }
}

function parseCallArgs(stream: TokenStream, callee: Expression): CallNode {
  const parsed = parseParenArgs(stream);
  return { kind: "Call", callee, args: parsed.args, start: callee.start, end: parsed.end, range: { start: callee.range.start, end: parsed.endRange } };
}

function parseParenArgs(stream: TokenStream): { args: readonly CallArgument[]; end: number; endRange: CallNode["range"]["end"] } {
  // Assumes the next token is LParen.
  stream.consume(); // LParen
  const args: CallArgument[] = [];
  for (;;) {
    const next = stream.peek();
    if (next.kind === "RParen") {
      const close = stream.consume();
      return { args, end: close.end, endRange: close.range.end };
    }
    if (next.kind === "EOF") {
      stream.push("expected-close", "Expected ')' to close the argument list.", next);
      return { args, end: next.end, endRange: next.range.end };
    }
    // Keyword argument: name=value.
    if (next.kind === "Identifier") {
      const after = stream.peek(1);
      if (after.kind === "Assign") {
        stream.consume();
        stream.consume();
        const value = parseExpression(stream);
        args.push({ name: next.value, value });
      } else {
        args.push({ name: null, value: parseExpression(stream) });
      }
    } else {
      args.push({ name: null, value: parseExpression(stream) });
    }
    const sep = stream.peek();
    if (sep.kind === "Comma") {
      stream.consume();
      // Allow trailing comma before ')'.
      continue;
    }
    if (sep.kind === "RParen" || sep.kind === "EOF") {
      continue;
    }
    // Unexpected token inside args: record and skip it to avoid stalling.
    stream.push("expected-expression", `Unexpected '${sep.value}' in argument list.`, sep);
    stream.consume();
  }
}

function parsePrimary(stream: TokenStream): Expression {
  const t = stream.peek();
  switch (t.kind) {
    case "Identifier": {
      stream.consume();
      const node: IdentifierNode = { kind: "Identifier", name: t.value, start: t.start, end: t.end, range: t.range };
      return node;
    }
    case "Keyword": {
      if (t.value === "true" || t.value === "false") {
        stream.consume();
        return { kind: "BooleanLiteral", value: t.value === "true", start: t.start, end: t.end, range: t.range };
      }
      if (t.value === "none") {
        stream.consume();
        return { kind: "NoneLiteral", start: t.start, end: t.end, range: t.range };
      }
      return invalid(stream, `Unexpected keyword '${t.value}'.`);
    }
    case "String": {
      stream.consume();
      return { kind: "StringLiteral", value: t.value, start: t.start, end: t.end, range: t.range };
    }
    case "Number": {
      stream.consume();
      return { kind: "NumberLiteral", value: Number(t.value), raw: t.value, start: t.start, end: t.end, range: t.range };
    }
    case "LParen": {
      const open = stream.consume();
      // Empty tuple: ().
      if (stream.peek().kind === "RParen") {
        const close = stream.consume();
        const node: TupleLiteralNode = { kind: "TupleLiteral", elements: [], start: open.start, end: close.end, range: { start: open.range.start, end: close.range.end } };
        return node;
      }
      const first = parseExpression(stream);
      if (stream.peek().kind !== "Comma") {
        const close = stream.peek();
        if (close.kind === "RParen") {
          stream.consume();
          const node: GroupNode = { kind: "Group", expr: first, start: open.start, end: close.end, range: { start: open.range.start, end: close.range.end } };
          return node;
        }
        stream.push("expected-close", "Expected ')' to close the group.", close);
        const node: GroupNode = { kind: "Group", expr: first, start: open.start, end: first.end, range: { start: open.range.start, end: first.range.end } };
        return node;
      }
      const elements: Expression[] = [first];
      while (stream.peek().kind === "Comma") {
        stream.consume();
        if (stream.peek().kind === "RParen") {
          break;
        }
        if (stream.peek().kind === "EOF") {
          break;
        }
        elements.push(parseExpression(stream));
      }
      const close = stream.peek();
      if (close.kind === "RParen") {
        stream.consume();
        const node: TupleLiteralNode = { kind: "TupleLiteral", elements, start: open.start, end: close.end, range: { start: open.range.start, end: close.range.end } };
        return node;
      }
      stream.push("expected-close", "Expected ')' to close the tuple.", close);
      const last = elements[elements.length - 1] ?? first;
      const node: TupleLiteralNode = { kind: "TupleLiteral", elements, start: open.start, end: last.end, range: { start: open.range.start, end: last.range.end } };
      return node;
    }
    case "LBracket": {
      const open = stream.consume();
      const elements: Expression[] = [];
      for (;;) {
        const next = stream.peek();
        if (next.kind === "RBracket") {
          const close = stream.consume();
          const node: ListLiteralNode = { kind: "ListLiteral", elements, start: open.start, end: close.end, range: { start: open.range.start, end: close.range.end } };
          return node;
        }
        if (next.kind === "EOF") {
          stream.push("expected-close", "Expected ']' to close the list.", next);
          const last = elements[elements.length - 1];
          const end = last ?? open;
          const node: ListLiteralNode = { kind: "ListLiteral", elements, start: open.start, end: end.end, range: { start: open.range.start, end: end.range.end } };
          return node;
        }
        elements.push(parseExpression(stream));
        if (stream.peek().kind === "Comma") {
          stream.consume();
        }
      }
    }
    case "LBrace": {
      const open = stream.consume();
      const entries: DictEntry[] = [];
      for (;;) {
        const next = stream.peek();
        if (next.kind === "RBrace") {
          const close = stream.consume();
          const node: DictLiteralNode = { kind: "DictLiteral", entries, start: open.start, end: close.end, range: { start: open.range.start, end: close.range.end } };
          return node;
        }
        if (next.kind === "EOF") {
          stream.push("expected-close", "Expected '}' to close the dict.", next);
          const last = entries[entries.length - 1];
          const end = last?.value ?? last?.key ?? open;
          const node: DictLiteralNode = { kind: "DictLiteral", entries, start: open.start, end: end.end, range: { start: open.range.start, end: end.range.end } };
          return node;
        }
        const key = parseExpression(stream);
        let value: Expression | null = null;
        if (stream.peek().kind === "Colon") {
          stream.consume();
          value = parseExpression(stream);
        }
        entries.push({ key, value });
        if (stream.peek().kind === "Comma") {
          stream.consume();
        }
      }
    }
    default: {
      const node: InvalidNode = invalid(stream, `Unexpected '${t.value}'.`);
      // Make progress on stray operators/punctuation so loops terminate.
      if (t.kind !== "EOF") {
        stream.consume();
      }
      return node;
    }
  }
}
