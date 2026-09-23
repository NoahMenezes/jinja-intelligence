import type { Range } from "../types/index.js";
import { templateReferences, unquote, walkStatements } from "../jinja/ast/query.js";
import { parseTemplate } from "../jinja/parser/parser.js";

/** A macro definition site. */
export interface MacroDef {
  readonly name: string;
  readonly range: Range;
  readonly params: readonly string[];
}

/** A block definition site. */
export interface BlockDef {
  readonly name: string;
  readonly range: Range;
}

/** Raw template relationship names as written. */
export interface TemplateEdges {
  readonly extendsName: string | null;
  readonly includes: readonly string[];
  readonly imports: readonly string[];
}

/** One indexed template file. */
export interface IndexedTemplate {
  readonly uri: string;
  readonly macros: readonly MacroDef[];
  readonly blocks: readonly BlockDef[];
  readonly edges: TemplateEdges;
  /** True when parsed from editor text rather than disk. */
  readonly fromEditor: boolean;
}

/**
 * Project-wide template index. Plain data + queries; mutation only through
 * upsert/remove so freshness invariants stay in one place. Total on bad
 * input (unparseable files index as empty).
 */
export class TemplateIndex {
  private readonly templates = new Map<string, IndexedTemplate>();

  upsert(uri: string, text: string, fromEditor: boolean): IndexedTemplate {
    const entry = indexText(uri, text, fromEditor);
    this.templates.set(uri, entry);
    return entry;
  }

  remove(uri: string): boolean {
    return this.templates.delete(uri);
  }

  get(uri: string): IndexedTemplate | null {
    return this.templates.get(uri) ?? null;
  }

  size(): number {
    return this.templates.size;
  }

  uris(): readonly string[] {
    return [...this.templates.keys()];
  }

  /** Template basenames (e.g. "base.j2") for string-literal completion. */
  basenames(): string[] {
    const names: string[] = [];
    for (const uri of this.templates.keys()) {
      const slash = uri.lastIndexOf("/");
      names.push(slash === -1 ? uri : uri.slice(slash + 1));
    }
    return [...new Set(names)].sort();
  }

  /** All macros named `name` across files. */
  macros(name: string): { uri: string; macro: MacroDef }[] {
    const out: { uri: string; macro: MacroDef }[] = [];
    for (const [uri, entry] of this.templates) {
      for (const macro of entry.macros) {
        if (macro.name === name) {
          out.push({ uri, macro });
        }
      }
    }
    return out;
  }

  /** All blocks named `name` across files. */
  blocks(name: string): { uri: string; block: BlockDef }[] {
    const out: { uri: string; block: BlockDef }[] = [];
    for (const [uri, entry] of this.templates) {
      for (const block of entry.blocks) {
        if (block.name === name) {
          out.push({ uri, block });
        }
      }
    }
    return out;
  }

  /** Files whose extends/include/import names resolve to `uri` by basename. */
  childrenOf(uri: string): string[] {
    const base = basenameOf(uri);
    if (base === null) {
      return [];
    }
    const out: string[] = [];
    for (const [candidate, entry] of this.templates) {
      if (candidate === uri) {
        continue;
      }
      const names = [entry.edges.extendsName, ...entry.edges.includes, ...entry.edges.imports];
      if (names.some((n) => n !== null && basenameOf(n) === base)) {
        out.push(candidate);
      }
    }
    return out.sort();
  }

  clear(): void {
    this.templates.clear();
  }
}

function basenameOf(path: string): string | null {
  const slash = path.lastIndexOf("/");
  const base = slash === -1 ? path : path.slice(slash + 1);
  return base.length === 0 ? null : base;
}

function indexText(uri: string, text: string, fromEditor: boolean): IndexedTemplate {
  try {
    const root = parseTemplate(text).root;
    const macros: MacroDef[] = [];
    const blocks: BlockDef[] = [];
    walkStatements(root.children, (node) => {
      if (node.kind === "Macro" && node.name !== null) {
        macros.push({ name: node.name, range: node.range, params: node.params.map((p) => p.name) });
      } else if (node.kind === "Block" && node.name !== null) {
        blocks.push({ name: node.name, range: node.range });
      }
    });
    const extendsNames: (string | null)[] = [];
    const includes: string[] = [];
    const imports: string[] = [];
    for (const ref of templateReferences(root)) {
      const name = unquote(ref.expr);
      if (name === null) {
        continue;
      }
      if (ref.statement.kind === "Extends") {
        extendsNames.push(name);
      } else if (ref.statement.kind === "Include") {
        includes.push(name);
      } else {
        imports.push(name);
      }
    }
    return {
      uri,
      macros,
      blocks,
      edges: { extendsName: extendsNames[0] ?? null, includes, imports },
      fromEditor,
    };
  } catch {
    return { uri, macros: [], blocks: [], edges: { extendsName: null, includes: [], imports: [] }, fromEditor };
  }
}
