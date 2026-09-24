import * as nodeFs from "node:fs";
import type { Location } from "vscode-languageserver/node.js";
import { analyzeTemplate, resolveAt } from "../../jinja/analysis/analyzer.js";
import { lookup, scopeAt } from "../../jinja/analysis/scope.js";
import type { FromNode, ImportNode, TemplateNode } from "../../jinja/ast/nodes.js";
import { findMacro, templateReferences, unquote, walkStatements } from "../../jinja/ast/query.js";
import { lex } from "../../jinja/lexer/lexer.js";
import type { Token } from "../../jinja/lexer/token-types.js";
import { previousSignificant } from "../../jinja/lexer/tokens.js";
import { parseTemplate } from "../../jinja/parser/parser.js";
import { resolveTemplate } from "../../templates/resolver.js";

export interface DefinitionContext {
  /** Workspace roots as file URIs. */
  readonly roots: readonly string[];
  /** Extra template directories (settings). */
  readonly templateDirs: readonly string[];
  /** Injected file reader (URI -> text); defaults to the filesystem. */
  readonly readFile?: (uri: string) => string | null;
}

/**
 * Go-to-definition: template strings → files, local names → definitions,
 * imported macros → the macro in the target file. Best-effort: unresolvable
 * positions return null. Total, never throws.
 */
export function definition(text: string, uri: string, offset: number, ctx: DefinitionContext): Location | null {
  try {
    const at = Math.min(Math.max(0, offset), text.length);
    const root = parseTemplate(text).root;
    const fileRef = templateReferenceAt(root, at);
    if (fileRef !== null) {
      const target = resolveTemplate(
        { fromUri: uri, name: fileRef, roots: ctx.roots, templateDirs: ctx.templateDirs },
        () => true,
      );
      if (target === null || readTarget(target, ctx) === null) {
        return null;
      }
      return { uri: target, range: zero() };
    }
    return symbolDefinition(text, root, uri, at, ctx);
  } catch {
    return null;
  }
}

/** String literal of a template reference containing the offset, unquoted. */
function templateReferenceAt(root: TemplateNode, at: number): string | null {
  for (const ref of templateReferences(root)) {
    if (ref.expr.start <= at && at <= ref.expr.end) {
      return unquote(ref.expr);
    }
  }
  return null;
}

function symbolDefinition(
  text: string,
  root: TemplateNode,
  uri: string,
  at: number,
  ctx: DefinitionContext,
): Location | null {
  const tokens = lex(text).tokens;
  const word = tokens.find(
    (t) => (t.kind === "Identifier" || t.kind === "Keyword") && t.start <= at && at <= t.end,
  );
  if (word === undefined) {
    return null;
  }
  // Property segments (`input` in `forms.input`) resolve through their base.
  const prev = previousSignificant(tokens, tokens.indexOf(word));
  if (prev !== null && prev.kind === "Dot") {
    return segmentDefinition(root, tokens, word, prev, uri, ctx);
  }
  const analysis = analyzeTemplate(root);
  const symbol =
    resolveAt(analysis, at) ?? lookup(scopeAt(analysis.root, at), word.value);
  if (symbol === null || symbol.name !== word.value) {
    // Binding names (`{% from x import button %}`) are definitions, not occurrences.
    return importBindingDefinition(root, word, uri, ctx);
  }
  if (symbol.kind === "Import") {
    return importSymbolDefinition(root, symbol.name, uri, ctx) ?? { uri, range: symbol.range };
  }
  return { uri, range: symbol.range };
}

function segmentDefinition(
  root: TemplateNode,
  tokens: readonly Token[],
  word: Token,
  dot: Token,
  uri: string,
  ctx: DefinitionContext,
): Location | null {
  let base: Token | null = null;
  for (const token of tokens) {
    if (token.start >= dot.start) {
      break;
    }
    if (token.end <= dot.start && token.kind !== "EOF") {
      base = token;
    }
  }
  if (base === null || base.kind !== "Identifier") {
    return null;
  }
  const analysis = analyzeTemplate(root);
  const resolved = resolveAt(analysis, base.start) ?? lookup(scopeAt(analysis.root, base.start), base.value);
  if (resolved === null || resolved.name !== base.value) {
    return null;
  }
  if (resolved.kind === "Import") {
    return importSymbolDefinition(root, resolved.name, uri, ctx, word.value) ?? { uri, range: resolved.range };
  }
  // Plain locals: jump to the base definition (segments have no site of their own).
  return { uri, range: resolved.range };
}

/** Import aliases used as values jump to the template file (or its macro). */
function importSymbolDefinition(
  root: TemplateNode,
  alias: string,
  uri: string,
  ctx: DefinitionContext,
  macroName?: string,
): Location | null {
  const found = findImportNode(root, alias);
  if (found === null) {
    return null;
  }
  const target = resolveImportNode(found, uri, ctx);
  if (target === null || readTarget(target, ctx) === null) {
    return null;
  }
  const macro = macroName ?? (found.kind === "From" ? macroForAlias(found, alias) : null);
  if (macro !== null) {
    const specific = macroInFile(target, ctx, macro);
    if (specific !== null) {
      return specific;
    }
  }
  return { uri: target, range: zero() };
}

/** Binding names inside import/from statements (not occurrences). */
function importBindingDefinition(
  root: TemplateNode,
  word: Token,
  uri: string,
  ctx: DefinitionContext,
): Location | null {
  const found = findImportBinding(root, word);
  if (found === null) {
    return null;
  }
  const target = resolveImportNode(found.node, uri, ctx);
  if (target === null || readTarget(target, ctx) === null) {
    return null;
  }
  // `from x import name`: prefer the macro itself when present.
  if (found.macro !== null) {
    const specific = macroInFile(target, ctx, found.macro);
    if (specific !== null) {
      return specific;
    }
  }
  return { uri: target, range: zero() };
}

interface ImportBinding {
  readonly node: ImportNode | FromNode;
  /** Macro name for from-imports; null for plain import aliases. */
  readonly macro: string | null;
}

function findImportBinding(root: TemplateNode, word: Token): ImportBinding | null {
  let found: ImportBinding | null = null;
  walkStatements(root.children, (node) => {
    if (found !== null) {
      return;
    }
    if (node.kind === "Import") {
      if (node.alias !== null && word.value === node.alias && contains(node, word)) {
        found = { node, macro: null };
      }
    } else if (node.kind === "From") {
      for (const name of node.names) {
        const label = name.alias ?? name.name;
        if (word.value === label && contains(node, word)) {
          found = { node, macro: name.name };
          break;
        }
      }
    }
  });
  return found;
}

function contains(node: { start: number; end: number }, word: Token): boolean {
  return node.start <= word.start && word.end <= node.end;
}

function importTarget(
  root: TemplateNode,
  alias: string,
  uri: string,
  ctx: DefinitionContext,
): string | null {
  const found = findImportNode(root, alias);
  if (found === null) {
    return null;
  }
  return resolveImportNode(found, uri, ctx);
}

/** Locate the Import/From statement behind an alias. */
function findImportNode(root: TemplateNode, alias: string): ImportNode | FromNode | null {
  let found: ImportNode | FromNode | null = null;
  walkStatements(root.children, (node) => {
    if (found !== null) {
      return;
    }
    if (node.kind === "Import" && node.alias === alias) {
      found = node;
    } else if (node.kind === "From") {
      for (const name of node.names) {
        if ((name.alias ?? name.name) === alias) {
          found = node;
          break;
        }
      }
    }
  });
  return found;
}

/** Original macro name behind a from-import alias. */
function macroForAlias(node: FromNode, alias: string): string | null {
  for (const name of node.names) {
    if ((name.alias ?? name.name) === alias) {
      return name.name;
    }
  }
  return null;
}

function resolveImportNode(node: ImportNode | FromNode, uri: string, ctx: DefinitionContext): string | null {
  const name = unquote(node.template);
  if (name === null) {
    return null;
  }
  return resolveTemplate(
    { fromUri: uri, name, roots: ctx.roots, templateDirs: ctx.templateDirs },
    () => true,
  );
}

/** Location of a macro inside a target file, or the file itself. Null when unreadable. */
function macroInFile(targetUri: string, ctx: DefinitionContext, name: string | null): Location | null {
  const source = readTarget(targetUri, ctx);
  if (source === null) {
    return null;
  }
  if (name === null) {
    return { uri: targetUri, range: zero() };
  }
  const macro = findMacro(parseTemplate(source).root, name);
  if (macro === null) {
    return { uri: targetUri, range: zero() };
  }
  return { uri: targetUri, range: macro.range };
}

function readTarget(targetUri: string, ctx: DefinitionContext): string | null {
  try {
    const reader = ctx.readFile ?? defaultReadFile;
    return reader(targetUri);
  } catch {
    return null;
  }
}

function defaultReadFile(targetUri: string): string | null {
  try {
    if (!targetUri.startsWith("file://")) {
      return null;
    }
    return nodeFs.readFileSync(decodeURIComponent(targetUri.slice("file://".length)), "utf8");
  } catch {
    return null;
  }
}


function zero(): Location["range"] {
  return { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
}
