/** A keyword argument passed to `render_template`: name plus value source span. */
export interface RenderKwarg {
  readonly name: string;
  readonly valueStart: number;
  readonly valueEnd: number;
}

/** One `render_template("template", name=value, ...)` call site. */
export interface RenderCall {
  /** Template path as written (unquoted), or null when not a literal. */
  readonly template: string | null;
  readonly kwargs: readonly RenderKwarg[];
  readonly start: number;
  readonly end: number;
}

const CALLEE = "render_template";

const DJANGO_CALLEES: Readonly<Record<string, { templateIndex: number; dictIndex: number }>> = {
  render: { templateIndex: 1, dictIndex: 2 },
  render_to_response: { templateIndex: 0, dictIndex: 1 },
};

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_]/.test(ch);
}

/**
 * Extract Flask `render_template` calls from Python source. Quote-, bracket-
 * and comment-aware mini-scanner (no Python parser): handles multiline calls,
 * nested parens, and methods like `self.render_template(...)`. Skips
 * `**kwargs` spreads and non-literal templates gracefully. Total, never throws.
 */
export function extractRenderCalls(text: string): RenderCall[] {
  try {
    const calls: RenderCall[] = [];
    let i = 0;
    while (i < text.length) {
      const at = findCallee(text, i);
      if (at === null) {
        break;
      }
      const parsed = parseCall(text, at);
      if (parsed === null) {
        i = at + CALLEE.length;
        continue;
      }
      calls.push(parsed.call);
      i = parsed.end;
    }
    return calls;
  } catch {
    return [];
  }
}

/** Next `render_template` word occurrence at or after `from`, else null. */
function findCallee(text: string, from: number): number | null {
  let i = from;
  let quote: string | null = null;
  let comment = false;
  while (i < text.length) {
    const ch = text[i];
    if (comment) {
      if (ch === "\n") {
        comment = false;
      }
      i++;
      continue;
    }
    if (quote !== null) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      i++;
      continue;
    }
    if (ch === "#") {
      comment = true;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      // Triple-quoted strings: skip to the matching triple.
      const triple = text.startsWith(ch.repeat(3), i) ? ch.repeat(3) : ch;
      if (triple.length === 3) {
        const end = text.indexOf(triple, i + 3);
        i = end === -1 ? text.length : end + 3;
        continue;
      }
      quote = ch;
      i++;
      continue;
    }
    if (
      text.startsWith(CALLEE, i) &&
      !isWordChar(text[i - 1]) &&
      !isWordChar(text[i + CALLEE.length])
    ) {
      return i;
    }
    i++;
  }
  return null;
}

/** Parse the argument list of the call starting at the callee offset. */
function parseCall(text: string, at: number): { call: RenderCall; end: number } | null {
  let i = at + CALLEE.length;
  while (i < text.length && /\s/.test(text[i] ?? "")) {
    i++;
  }
  if (text[i] !== "(") {
    return null;
  }
  const args = splitArgs(text, i);
  if (args === null) {
    return null;
  }
  const kwargs: RenderKwarg[] = [];
  let template: string | null = null;
  let positional = 0;
  for (const arg of args.items) {
    const kwarg = splitKwarg(text, arg);
    if (kwarg !== null) {
      if (kwarg.name !== "**") {
        kwargs.push(kwarg);
      }
      continue;
    }
    if (positional === 0) {
      template = readString(text, arg);
    }
    positional++;
  }
  return { call: { template, kwargs, start: at, end: args.end }, end: args.end };
}

/**
 * Extract Django `render` / `render_to_response` calls. Same RenderCall
 * shape: template from the positional slot, context from a dict literal
 * (bare-name contexts record the template with zero vars). Total, never throws.
 */
export function extractDjangoCalls(text: string): RenderCall[] {
  try {
    const calls: RenderCall[] = [];
    let i = 0;
    while (i < text.length) {
      const found = findDjangoCallee(text, i);
      if (found === null) {
        break;
      }
      const spec = DJANGO_CALLEES[found.name];
      if (spec === undefined) {
        i = found.end;
        continue;
      }
      const parsed = parseDjangoCall(text, found, spec);
      if (parsed === null) {
        i = found.end;
        continue;
      }
      calls.push(parsed.call);
      i = parsed.end;
    }
    return calls;
  } catch {
    return [];
  }
}

/** All template calls, Flask and Django. */
export function extractTemplateCalls(text: string): RenderCall[] {
  try {
    return [...extractRenderCalls(text), ...extractDjangoCalls(text)].sort((a, b) => a.start - b.start);
  } catch {
    return [];
  }
}

function findDjangoCallee(text: string, from: number): { name: string; start: number; end: number } | null {
  const names = Object.keys(DJANGO_CALLEES).sort((a, b) => b.length - a.length);
  let i = from;
  let quote: string | null = null;
  let comment = false;
  while (i < text.length) {
    const ch = text[i];
    if (comment) {
      if (ch === "\n") {
        comment = false;
      }
      i++;
      continue;
    }
    if (quote !== null) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      i++;
      continue;
    }
    if (ch === "#") {
      comment = true;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      i++;
      continue;
    }
    for (const name of names) {
      if (text.startsWith(name, i) && !isWordChar(text[i - 1]) && !isWordChar(text[i + name.length])) {
        return { name, start: i, end: i + name.length };
      }
    }
    i++;
  }
  return null;
}

function parseDjangoCall(
  text: string,
  callee: { name: string; start: number; end: number },
  spec: { templateIndex: number; dictIndex: number },
): { call: RenderCall; end: number } | null {
  let i = callee.end;
  while (i < text.length && /\s/.test(text[i] ?? "")) {
    i++;
  }
  if (text[i] !== "(") {
    return null;
  }
  const args = splitArgs(text, i);
  if (args === null) {
    return null;
  }
  const templateArg = args.items[spec.templateIndex];
  const template = templateArg === undefined ? null : readString(text, templateArg);
  const dictArg = args.items[spec.dictIndex];
  const kwargs = dictArg === undefined ? [] : parseDictEntries(text, dictArg);
  return { call: { template, kwargs, start: callee.start, end: args.end }, end: args.end };
}

/** String keys of a dict-literal argument; anything else is skipped. */
function parseDictEntries(text: string, arg: { start: number; end: number }): RenderKwarg[] {
  const out: RenderKwarg[] = [];
  const body = dictBody(text, arg.start, arg.end);
  if (body === null) {
    return out;
  }
  for (const part of splitTopLevel(text, body.start, body.end)) {
    const colon = colonAtDepthZero(text, part.start, part.end);
    if (colon === -1) {
      continue;
    }
    const key = text.slice(part.start, colon).trim();
    if (key.length >= 2) {
      const first = key[0];
      const last = key[key.length - 1];
      if ((first === '"' || first === "'") && first === last) {
        const name = key.slice(1, -1);
        if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
          out.push({ name, valueStart: colon + 1, valueEnd: part.end });
        }
      }
    }
  }
  return out;
}

/** Span inside the outermost braces of a dict literal, or null. */
function dictBody(text: string, start: number, end: number): { start: number; end: number } | null {
  let i = start;
  while (i < end && /\s/.test(text[i] ?? "")) {
    i++;
  }
  if (text[i] !== "{") {
    return null;
  }
  let depth = 0;
  let quote: string | null = null;
  for (let j = i; j < end; j++) {
    const ch = text[j];
    if (quote !== null) {
      if (ch === "\\") {
        j++;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      depth--;
      if (depth === 0) {
        return { start: i + 1, end: j };
      }
    }
  }
  return null;
}

/** Split a span into top-level comma segments (nesting/quote aware). */
function splitTopLevel(text: string, start: number, end: number): { start: number; end: number }[] {
  const parts: { start: number; end: number }[] = [];
  let depth = 0;
  let current = start;
  let quote: string | null = null;
  let i = start;
  while (i < end) {
    const ch = text[i];
    if (quote !== null) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      i++;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      depth = Math.max(0, depth - 1);
    } else if (ch === "," && depth === 0) {
      parts.push({ start: current, end: i });
      current = i + 1;
    }
    i++;
  }
  parts.push({ start: current, end });
  return parts;
}

/** First depth-0 colon in a span, or -1. */
function colonAtDepthZero(text: string, start: number, end: number): number {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start; i < end; i++) {
    const ch = text[i];
    if (quote !== null) {
      if (ch === "\\") {
        i++;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      depth = Math.max(0, depth - 1);
    } else if (ch === ":" && depth === 0) {
      const next = text[i + 1];
      if (next === ":") {
        continue;
      }
      return i;
    }
  }
  return -1;
}

interface ArgList {
  readonly items: { start: number; end: number }[];
  /** Offset just past the closing paren (or EOF when unclosed). */
  readonly end: number;
}

/** Split a parenthesized list into top-level comma segments. */
function splitArgs(text: string, open: number): ArgList | null {
  const items: { start: number; end: number }[] = [];
  let depth = 0;
  let start = open + 1;
  let i = open + 1;
  let quote: string | null = null;
  let comment = false;
  while (i < text.length) {
    const ch = text[i];
    if (comment) {
      if (ch === "\n") {
        comment = false;
      }
      i++;
      continue;
    }
    if (quote !== null) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      i++;
      continue;
    }
    if (ch === "#") {
      comment = true;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const triple = text.startsWith(ch.repeat(3), i) ? ch.repeat(3) : ch;
      if (triple.length === 3) {
        const end = text.indexOf(triple, i + 3);
        i = end === -1 ? text.length : end + 3;
        continue;
      }
      quote = ch;
      i++;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      if (depth === 0) {
        if (ch !== ")") {
          return null;
        }
        items.push({ start, end: i });
        return { items, end: i + 1 };
      }
      depth--;
    } else if (ch === "," && depth === 0) {
      items.push({ start, end: i });
      start = i + 1;
    }
    i++;
  }
  // Unclosed call while typing: keep what we have.
  items.push({ start, end: i });
  return { items, end: i };
}

/** Split `name = value` at depth 0; null for positional args and spreads. */
function splitKwarg(text: string, arg: { start: number; end: number }): RenderKwarg | null {
  const slice = text.slice(arg.start, arg.end);
  if (/^\s*\*\*/.test(slice)) {
    return { name: "**", valueStart: arg.start, valueEnd: arg.end };
  }
  let depth = 0;
  let quote: string | null = null;
  let i = arg.start;
  while (i < arg.end) {
    const ch = text[i];
    if (quote !== null) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      i++;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      depth++;
    } else if (ch === ")" || ch === "]" || ch === "}") {
      depth = Math.max(0, depth - 1);
    } else if (ch === "=" && depth === 0) {
      const next = text[i + 1];
      if (next === "=") {
        return null;
      }
      const name = text.slice(arg.start, i).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
        return null;
      }
      return { name, valueStart: i + 1, valueEnd: arg.end };
    }
    i++;
  }
  return null;
}

/** Read a quoted string value; null for anything else. */
function readString(text: string, arg: { start: number; end: number }): string | null {
  const slice = text.slice(arg.start, arg.end).trim();
  if (slice.length >= 2) {
    const first = slice[0];
    const last = slice[slice.length - 1];
    if ((first === '"' || first === "'") && first === last) {
      return slice.slice(1, -1);
    }
  }
  return null;
}
