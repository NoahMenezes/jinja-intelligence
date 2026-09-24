import type { Hover } from "vscode-languageserver/node.js";
import { analyzeTemplate, resolveAt } from "../../jinja/analysis/analyzer.js";
import { lookup, scopeAt } from "../../jinja/analysis/scope.js";
import type { Symbol } from "../../jinja/analysis/symbols.js";
import type { MacroNode, TemplateChild, TemplateNode } from "../../jinja/ast/nodes.js";
import { BUILTIN_DOCS, LOOP_ATTRIBUTE_DOCS } from "../../jinja/docs/builtins.js";
import { FILTER_DOCS } from "../../jinja/docs/filters.js";
import { KEYWORD_DOCS } from "../../jinja/docs/keywords.js";
import { TEST_DOCS } from "../../jinja/docs/tests.js";
import type { DocEntry } from "../../jinja/docs/types.js";
import { lex } from "../../jinja/lexer/lexer.js";
import type { Token } from "../../jinja/lexer/token-types.js";
import { previousSignificant } from "../../jinja/lexer/tokens.js";
import { parseTemplate } from "../../jinja/parser/parser.js";

/**
 * Hover documentation. Lexer-driven role detection, scope-resolved symbols,
 * hand-written builtin docs. Unknown positions return null — never fiction.
 * Total, never throws.
 */
export function hover(text: string, offset: number, options?: HoverOptions): Hover | null {
  try {
    return hoverInner(text, Math.min(Math.max(0, offset), text.length), options);
  } catch {
    return null;
  }
}

export interface HoverOptions {
  /** Python-provided context for this template: name → source file URIs. */
  readonly contextSources?: ReadonlyMap<string, readonly string[]>;
  /** Python-provided types by variable name (Phase 18). */
  readonly contextTypes?: Readonly<Record<string, { name: string; attrs: readonly string[] }>>;
}

/** One-line docs for Python builtin types appearing in templates. */
const PYTHON_TYPE_DOCS: Readonly<Record<string, string>> = {
  str: "Python string.",
  int: "Python integer.",
  bool: "Python boolean.",
  float: "Python float.",
  list: "Python list.",
  dict: "Python dict.",
};

function hoverInner(text: string, at: number, options?: HoverOptions): Hover | null {
  const tokens = lex(text).tokens;
  const word = tokens.find(
    (t) => (t.kind === "Identifier" || t.kind === "Keyword") && t.start <= at && at <= t.end,
  );
  if (word === undefined) {
    return null;
  }
  const tag = enclosingTag(tokens, at);
  if (tag === null || tag === "comment") {
    return null;
  }

  const prev = previousSignificant(tokens, tokens.indexOf(word));
  const prevPrev = prev === null ? null : previousSignificant(tokens, tokens.indexOf(prev));

  // `| name` — but not in a `{% filter %}` header (handled below by head rule).
  if (prev !== null && prev.kind === "Pipe" && !(tag === "block" && isFilterHeader(tokens, word))) {
    const doc = FILTER_DOCS[word.value];
    return doc === undefined ? null : builtinHover(word, doc, "filter");
  }
  // `is [not] name`.
  if (prev !== null && prev.kind === "Keyword" && prev.value === "is") {
    const doc = TEST_DOCS[word.value];
    return doc === undefined ? null : builtinHover(word, doc, "test");
  }
  if (
    prev !== null &&
    prev.kind === "Keyword" &&
    prev.value === "not" &&
    prevPrev !== null &&
    prevPrev.kind === "Keyword" &&
    prevPrev.value === "is"
  ) {
    const doc = TEST_DOCS[word.value];
    return doc === undefined ? null : builtinHover(word, doc, "test");
  }
  // `base.name` — only `loop.*` attributes are known.
  if (prev !== null && prev.kind === "Dot") {
    return loopAttributeHover(text, tokens, word, prev);
  }
  // `{% filter name %}` header.
  if (tag === "block" && isFilterHeader(tokens, word)) {
    const doc = FILTER_DOCS[word.value];
    return doc === undefined ? null : builtinHover(word, doc, "filter");
  }
  // Statement and operator keywords.
  if (word.kind === "Keyword") {
    const doc = KEYWORD_DOCS[word.value];
    return doc === undefined ? null : builtinHover(word, doc, "statement");
  }

  const root = parseTemplate(text).root;
  const analysis = analyzeTemplate(root);
  const symbol = resolveAt(analysis, at) ?? lookup(scopeAt(analysis.root, at), word.value);
  if (symbol !== null && symbol.name === word.value) {
    return symbolHover(text, root, word, symbol);
  }
  const builtin = BUILTIN_DOCS[word.value];
  if (builtin !== undefined) {
    return builtinHover(word, builtin, "builtin");
  }
  const pythonType = PYTHON_TYPE_DOCS[word.value];
  if (pythonType !== undefined) {
    return {
      contents: {
        kind: "markdown",
        value: ["```jinja", word.value, "```", "", pythonType, "", "_builtin · python type_"].join("\n"),
      },
      range: word.range,
    };
  }
  const sources = options?.contextSources?.get(word.value) ?? [];
  const typed = options?.contextTypes?.[word.value];
  if (typed !== undefined && typed.name !== "unknown") {
    const shown = typed.attrs.slice(0, 10);
    const lines = ["```jinja", `${word.value}: ${typed.name}`, "```", ""];
    if (shown.length > 0) {
      lines.push(...shown.map((a) => `- \`${a}\``));
      if (typed.attrs.length > shown.length) {
        lines.push(`- …and ${typed.attrs.length - shown.length} more`);
      }
      lines.push("");
    }
    lines.push(
      sources.length > 0
        ? `Provided by ${sources.map((s) => `\`${basenameOf(s)}\``).join(", ")} via \`render_template\`.`
        : "Provided by the template context.",
    );
    lines.push("", "_external · typed_");
    return { contents: { kind: "markdown", value: lines.join("\n") }, range: word.range };
  }
  const provenance =
    sources.length > 0
      ? `Provided by ${sources.map((s) => `\`${basenameOf(s)}\``).join(", ")} via \`render_template\`.`
      : "Provided by the template context.";
  return {
    contents: {
      kind: "markdown",
      value: ["```jinja", word.value, "```", "", provenance, "", "_external · type unknown_"].join("\n"),
    },
    range: word.range,
  };
}

/** File basename for provenance lines (`app.py`, not a full URI). */
function basenameOf(uri: string): string {
  const slash = uri.lastIndexOf("/");
  return slash === -1 ? uri : uri.slice(slash + 1);
}

type TagKind = "variable" | "block" | "comment";

/** Innermost unclosed tag holding the offset, or null outside tags. */
function enclosingTag(tokens: readonly Token[], at: number): TagKind | null {
  let open: TagKind | null = null;
  for (const token of tokens) {
    if (token.start > at) {
      break;
    }
    if (token.kind === "VariableOpen") {
      open = "variable";
    } else if (token.kind === "BlockOpen") {
      open = "block";
    } else if (token.kind === "CommentOpen") {
      open = "comment";
    } else if (
      token.end <= at &&
      (token.kind === "VariableClose" || token.kind === "BlockClose" || token.kind === "CommentClose")
    ) {
      open = null;
    }
  }
  return open;
}


/** True when the word is the filter name of a `{% filter name %}` header. */
function isFilterHeader(tokens: readonly Token[], word: Token): boolean {
  // Find the enclosing BlockOpen, then check the head word is `filter`.
  let openIndex = -1;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === undefined) {
      break;
    }
    if (token.start > word.start) {
      break;
    }
    if (token.kind === "BlockOpen") {
      openIndex = i;
    }
  }
  const head = openIndex === -1 ? undefined : tokens[openIndex + 1];
  return head !== undefined && head.kind === "Keyword" && head.value === "filter";
}

function loopAttributeHover(text: string, tokens: readonly Token[], word: Token, dot: Token): Hover | null {
  let base: Token | null = null;
  for (const token of tokens) {
    if (token.start >= dot.start) {
      break;
    }
    if (token.end <= dot.start && token.kind !== "EOF") {
      base = token;
    }
  }
  if (base === null || base.kind !== "Identifier" || base.value !== "loop") {
    return null;
  }
  // Confirm `loop` really is the loop helper (not some shadowing definition).
  const root = parseTemplate(text).root;
  const analysis = analyzeTemplate(root);
  const resolved = resolveAt(analysis, base.start);
  if (resolved === null || resolved.name !== "loop" || resolved.kind !== "Loop") {
    return null;
  }
  const doc = LOOP_ATTRIBUTE_DOCS[word.value];
  if (doc === undefined) {
    return null;
  }
  return builtinHover(word, doc, "loop attribute");
}

function builtinHover(word: Token, doc: DocEntry, category: string): Hover {
  return {
    contents: {
      kind: "markdown",
      value: ["```jinja", doc.signature, "```", "", doc.description, "", `_${category} · builtin_`].join("\n"),
    },
    range: word.range,
  };
}

const SYMBOL_SENTENCES: Record<Symbol["kind"], string> = {
  Loop: "Loop variable.",
  Set: "Template variable assigned with `{% set %}`.",
  Macro: "Template macro.",
  MacroParam: "Macro parameter.",
  Import: "Imported template name.",
  Block: "Template block.",
  With: "Temporary `{% with %}` variable.",
  External: "External variable.",
};

function symbolHover(text: string, root: TemplateNode, word: Token, symbol: Symbol): Hover {
  const sentence = SYMBOL_SENTENCES[symbol.kind];
  let signature = symbol.name;
  if (symbol.kind === "Macro") {
    const node = findMacro(root.children, symbol.name);
    if (node !== null) {
      signature = `${node.name ?? symbol.name}(${node.params
        .map((p) => (p.defaultValue === null ? p.name : `${p.name}=${text.slice(p.defaultValue.start, p.defaultValue.end)}`))
        .join(", ")})`;
    }
  }
  const snippet = text.slice(symbol.start, symbol.end).split("\n")[0] ?? "";
  const short = snippet.length > 80 ? `${snippet.slice(0, 80)}…` : snippet;
  return {
    contents: {
      kind: "markdown",
      value: ["```jinja", signature, "```", "", sentence, "", `_Defined by \`${short}\`._`].join("\n"),
    },
    range: word.range,
  };
}

function findMacro(children: readonly TemplateChild[], name: string): MacroNode | null {
  for (const child of children) {
    if (child.kind === "Macro" && child.name === name) {
      return child;
    }
    const nested = childBodies(child);
    if (nested !== null) {
      const found = findMacro(nested, name);
      if (found !== null) {
        return found;
      }
    }
  }
  return null;
}

function childBodies(child: TemplateChild): readonly TemplateChild[] | null {
  switch (child.kind) {
    case "If":
      return [...child.body, ...child.elifs.flatMap((e) => e.body), ...(child.elseBody ?? [])];
    case "For":
      return [...child.body, ...(child.elseBody ?? [])];
    case "Set":
      return child.body;
    case "Block":
    case "Macro":
    case "CallBlock":
    case "FilterBlock":
    case "With":
      return child.body;
    default:
      return null;
  }
}
