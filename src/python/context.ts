import { extractTemplateCalls, type RenderCall } from "./scanner.js";
import { extractPythonSymbols } from "./symbols.js";
import { attrsOf, resolveKwargType, type ResolvedType } from "./types.js";

/** One template variable's type, plain data. */
export interface TypeInfo {
  readonly kind: "class" | "builtin" | "unknown";
  readonly name: string;
  readonly attrs: readonly string[];
}

/** One template's Python-provided context: variable names plus source files. */
export interface TemplateContext {
  readonly vars: readonly string[];
  readonly sources: readonly string[];
  /** Variable name → resolved type (absent means unknown). */
  readonly types: Readonly<Record<string, TypeInfo>>;
}

/**
 * Per-file render calls plus source text. Plain data; Project owns freshness
 * (scan, upsert, revert) exactly like the template index. Total, never throws.
 */
export class PythonIndex {
  private readonly calls = new Map<string, RenderCall[]>();
  private readonly texts = new Map<string, string>();

  upsert(uri: string, text: string): RenderCall[] {
    try {
      const found = extractTemplateCalls(text);
      if (found.length === 0) {
        this.calls.delete(uri);
      } else {
        this.calls.set(uri, found);
      }
      this.texts.set(uri, text);
      return found;
    } catch {
      this.calls.delete(uri);
      this.texts.delete(uri);
      return [];
    }
  }

  remove(uri: string): boolean {
    this.texts.delete(uri);
    return this.calls.delete(uri);
  }

  get(uri: string): readonly RenderCall[] {
    return this.calls.get(uri) ?? [];
  }

  text(uri: string): string | null {
    return this.texts.get(uri) ?? null;
  }

  size(): number {
    return this.calls.size;
  }

  uris(): readonly string[] {
    return [...this.calls.keys()];
  }

  clear(): void {
    this.calls.clear();
    this.texts.clear();
  }
}

/** One indexed Python file's contribution to the merge. */
export interface ContextFile {
  readonly calls: readonly RenderCall[];
  readonly text: string;
}

/**
 * Merge every indexed file's calls into template → context, resolving kwarg
 * types against the providing file's own classes and functions. Total,
 * never throws.
 */
export function buildContext(files: ReadonlyMap<string, ContextFile>): Map<string, TemplateContext> {
  const merged = new Map<string, { vars: Set<string>; sources: Set<string>; types: Record<string, TypeInfo> }>();
  try {
    for (const [uri, entry] of files) {
      const symbols = symbolsOf(entry.text);
      for (const call of entry.calls) {
        if (call.template === null) {
          continue;
        }
        let target = merged.get(call.template);
        if (target === undefined) {
          target = { vars: new Set(), sources: new Set(), types: {} };
          merged.set(call.template, target);
        }
        for (const kwarg of call.kwargs) {
          target.vars.add(kwarg.name);
          if (symbols !== null && target.types[kwarg.name] === undefined) {
            const valueSource = entry.text.slice(kwarg.valueStart, kwarg.valueEnd);
            target.types[kwarg.name] = toTypeInfo(resolveKwargType(valueSource, symbols));
          }
        }
        target.sources.add(uri);
      }
    }
  } catch {
    // Partial merges still help.
  }
  const out = new Map<string, TemplateContext>();
  for (const [template, entry] of merged) {
    out.set(template, { vars: [...entry.vars], sources: [...entry.sources], types: entry.types });
  }
  return out;
}

function symbolsOf(text: string): ReturnType<typeof extractPythonSymbols> | null {
  try {
    return extractPythonSymbols(text);
  } catch {
    return null;
  }
}

function toTypeInfo(resolved: ResolvedType): TypeInfo {
  if (resolved.kind === "class") {
    return { kind: "class", name: resolved.name, attrs: resolved.attrs };
  }
  if (resolved.kind === "builtin") {
    return { kind: "builtin", name: resolved.name, attrs: [] };
  }
  return { kind: "unknown", name: "unknown", attrs: [] };
}

/** Find the context entry whose written name matches the template file. */
export function contextFor(
  context: ReadonlyMap<string, TemplateContext>,
  templateUri: string,
): TemplateContext | null {
  const slash = templateUri.lastIndexOf("/");
  const basename = slash === -1 ? templateUri : templateUri.slice(slash + 1);
  for (const [written, entry] of context) {
    if (written === basename || written.endsWith(`/${basename}`) || basename.endsWith(`/${written}`)) {
      return entry;
    }
  }
  return null;
}
