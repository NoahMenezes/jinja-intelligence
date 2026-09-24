import type { ClassDef, FileSymbols } from "./symbols.js";

/** A resolved template-variable type. Plain data, no Maps. */
export type ResolvedType =
  | { readonly kind: "builtin"; readonly name: string }
  | { readonly kind: "class"; readonly name: string; readonly attrs: readonly string[] }
  | { readonly kind: "unknown" };

const BUILTIN_TYPES: ReadonlySet<string> = new Set([
  "str",
  "int",
  "bool",
  "float",
  "list",
  "dict",
  "tuple",
  "set",
  "bytes",
  "None",
  "Any",
]);

/**
 * Resolve a kwarg value's source text to a type using same-file classes and
 * function returns: bare class names, `Class(...)` construction, and
 * `func(...)` calls with annotated returns. Anything else is unknown —
 * the graceful fallback callers rely on. Total, never throws.
 */
export function resolveKwargType(valueSource: string, symbols: FileSymbols): ResolvedType {
  try {
    const value = valueSource.trim();
    if (value.length === 0) {
      return { kind: "unknown" };
    }
    const call = splitCall(value);
    if (call !== null) {
      const asClass = symbols.classes.get(call.callee);
      if (asClass !== undefined) {
        return classOf(asClass, symbols);
      }
      const func = symbols.functions.get(call.callee);
      if (func !== undefined && func.returns !== null) {
        return resolveName(func.returns, symbols, 0);
      }
      return { kind: "unknown" };
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
      return resolveName(value, symbols, 0);
    }
    return { kind: "unknown" };
  } catch {
    return { kind: "unknown" };
  }
}

/** Attribute names for a resolved class type, else empty. */
export function attrsOf(resolved: ResolvedType): readonly string[] {
  return resolved.kind === "class" ? resolved.attrs : [];
}

/** Split `Name(...)` with balanced parens; null for anything else. */
function splitCall(value: string): { callee: string; args: string } | null {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(/.exec(value);
  if (match === null || match[1] === undefined) {
    return null;
  }
  let depth = 0;
  let quote: string | null = null;
  for (let i = match[0].length - 1; i < value.length; i++) {
    const ch = value[i];
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
    } else if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
      if (depth === 0) {
        const rest = value.slice(i + 1).trim();
        if (rest.length > 0) {
          return null;
        }
        return { callee: match[1], args: value.slice(match[0].length, i) };
      }
    }
  }
  return null;
}

/** Resolve a type name: builtins, same-file classes (with base attrs), else unknown. */
function resolveName(name: string, symbols: FileSymbols, depth: number): ResolvedType {
  const unwrapped = unwrap(name.trim());
  if (BUILTIN_TYPES.has(unwrapped)) {
    return { kind: "builtin", name: unwrapped };
  }
  if (depth > 2) {
    return { kind: "unknown" };
  }
  const cls = symbols.classes.get(unwrapped);
  if (cls === undefined) {
    // A call-shaped name like `make_user()` without parens data: try callee.
    const call = splitCall(unwrapped);
    if (call !== null) {
      const func = symbols.functions.get(call.callee);
      if (func !== undefined && func.returns !== null) {
        return resolveName(func.returns, symbols, depth + 1);
      }
    }
    return { kind: "unknown" };
  }
  return classOf(cls, symbols);
}

function classOf(cls: ClassDef, symbols: FileSymbols): ResolvedType {
  const attrs = new Set<string>();
  for (const [name] of cls.attrs) {
    attrs.add(name);
  }
  for (const base of cls.bases) {
    const parent = symbols.classes.get(base);
    if (parent !== undefined) {
      for (const [name] of parent.attrs) {
        attrs.add(name);
      }
    }
  }
  return { kind: "class", name: cls.name, attrs: [...attrs].sort() };
}

/** Strip Optional/union wrappers and container nesting to a base name. */
function unwrap(written: string): string {
  let type = written.trim();
  const optional = /^(?:Optional|typing\.Optional)\[(.+)\]$/.exec(type);
  if (optional?.[1] !== undefined) {
    type = optional[1].trim();
  }
  const union = type.split("|").map((p) => p.trim()).filter((p) => p.length > 0 && p !== "None");
  if (union.length === 1 && union[0] !== undefined) {
    type = union[0];
  }
  const generic = /^([A-Za-z_][A-Za-z0-9_.]*)\s*\[/.exec(type);
  if (generic?.[1] !== undefined) {
    // list[X]/dict[K, V]: element detail is out of scope; keep the container.
    if (BUILTIN_TYPES.has(generic[1]) || generic[1].includes(".")) {
      const short = generic[1].split(".").pop() ?? generic[1];
      return BUILTIN_TYPES.has(short) ? short : type;
    }
    return generic[1];
  }
  const dotted = type.split(".").pop() ?? type;
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(dotted) ? dotted : type;
}
