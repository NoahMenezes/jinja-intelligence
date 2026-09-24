/** A Python class with its attribute type names as written. */
export interface ClassDef {
  readonly name: string;
  readonly kind: "class" | "dataclass" | "typeddict" | "pydantic";
  readonly bases: readonly string[];
  /** Attribute name → written type text (`"unknown"` for bare assignments). */
  readonly attrs: ReadonlyMap<string, string>;
}

/** A function definition with its raw return annotation, if any. */
export interface FuncDef {
  readonly name: string;
  readonly returns: string | null;
}

export interface FileSymbols {
  readonly classes: ReadonlyMap<string, ClassDef>;
  readonly functions: ReadonlyMap<string, FuncDef>;
}

const CLASS_RE = /^class\s+([A-Za-z_]\w*)\s*(?:\(([^)]*)\))?\s*:/;
const DEF_RE = /^def\s+([A-Za-z_]\w*)\s*\(/;
const ATTR_RE = /^([A-Za-z_]\w*)\s*:\s*([^=#]+?)\s*(?:=|$)/;
const BARE_ASSIGN_RE = /^([A-Za-z_]\w*)\s*=\s*[^=]/;
const NON_ASSIGN_START = /^(if|elif|else|for|while|with|return|assert|raise|yield|import|from|pass|break|continue|del|global|nonlocal|try|except|finally)\b/;

interface ClassFrame {
  readonly kind: "class";
  readonly indent: number;
  readonly name: string;
  readonly bases: readonly string[];
  readonly dataclass: boolean;
  readonly attrs: Map<string, string>;
  readonly nested: boolean;
}

interface DefFrame {
  readonly kind: "def";
  readonly indent: number;
}

/**
 * Extract classes (attributes, bases, kinds) and function return annotations
 * from Python source. Line-based with indent tracking — no Python parser:
 * nested classes, methods, `self.x`, and decorators beyond `@dataclass`
 * are skipped gracefully. Total, never throws.
 */
export function extractPythonSymbols(text: string): FileSymbols {
  try {
    const classes = new Map<string, ClassDef>();
    const functions = new Map<string, FuncDef>();
    const lines = text.split("\n");
    const stack: (ClassFrame | DefFrame)[] = [];
    let inTriple: string | null = null;
    let pendingDataclass = false;

    const popTo = (indent: number): void => {
      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top === undefined || top.indent < indent) {
          break;
        }
        const frame = stack.pop();
        if (frame !== undefined && frame.kind === "class" && !frame.nested) {
          const def: ClassDef = {
            name: frame.name,
            kind: classify(frame),
            bases: frame.bases,
            attrs: frame.attrs,
          };
          if (!classes.has(def.name)) {
            classes.set(def.name, def);
          }
        }
      }
    };

    let i = 0;
    while (i < lines.length) {
      const raw = lines[i] ?? "";
      const triple = countTriple(raw);
      if (inTriple !== null) {
        if (triple % 2 === 1) {
          inTriple = null;
        }
        i++;
        continue;
      }
      if (triple % 2 === 1) {
        inTriple = "x";
        i++;
        continue;
      }
      const indent = raw.length - raw.trimStart().length;
      const line = raw.trim();
      if (line.length === 0 || line.startsWith("#")) {
        i++;
        continue;
      }
      popTo(indent);
      if (/^@dataclass\b/.test(line)) {
        pendingDataclass = true;
        i++;
        continue;
      }
      if (line.startsWith("@")) {
        i++;
        continue;
      }
      const cls = CLASS_RE.exec(line);
      if (cls !== null && cls[1] !== undefined) {
        const bases = (cls[2] ?? "").split(",").map((b) => b.trim()).filter((b) => b.length > 0);
        const enclosing = stack[stack.length - 1];
        stack.push({
          kind: "class",
          indent,
          name: cls[1],
          bases,
          dataclass: pendingDataclass,
          attrs: new Map(),
          nested: enclosing !== undefined,
        });
        pendingDataclass = false;
        i++;
        continue;
      }
      pendingDataclass = false;
      const top = stack[stack.length - 1];
      if (top === undefined) {
        const func = matchDef(lines, i);
        pendingDataclass = false;
        if (func !== null) {
          if (!functions.has(func.name)) {
            functions.set(func.name, func);
          }
          i = func.nextLine;
          continue;
        }
        i++;
        continue;
      }
      if (top.kind === "def") {
        i++;
        continue;
      }
      // Inside a class body (not nested, not inside a method).
      const defMatch = DEF_RE.exec(line);
      if (defMatch !== null) {
        stack.push({ kind: "def", indent });
        pendingDataclass = false;
        const func = matchDef(lines, i);
        if (func !== null && !functions.has(func.name)) {
          functions.set(func.name, func);
        }
        i++;
        continue;
      }
      if (!top.nested) {
        const attr = ATTR_RE.exec(line);
        if (attr !== null && attr[1] !== undefined && attr[2] !== undefined) {
          if (!top.attrs.has(attr[1])) {
            top.attrs.set(attr[1], attr[2].trim());
          }
        } else if (!NON_ASSIGN_START.test(line)) {
          const bare = BARE_ASSIGN_RE.exec(line);
          if (bare !== null && bare[1] !== undefined && !top.attrs.has(bare[1])) {
            top.attrs.set(bare[1], "unknown");
          }
        }
      }
      i++;
    }
    popTo(-1);
    return { classes, functions };
  } catch {
    return { classes: new Map(), functions: new Map() };
  }
}

function classify(frame: { dataclass: boolean; bases: readonly string[] }): ClassDef["kind"] {
  if (frame.dataclass) {
    return "dataclass";
  }
  if (frame.bases.some((b) => b === "TypedDict" || b.endsWith(".TypedDict"))) {
    return "typeddict";
  }
  if (frame.bases.some((b) => b === "BaseModel" || b.endsWith(".BaseModel"))) {
    return "pydantic";
  }
  return "class";
}

/** Count triple-quote occurrences on a line (crude docstring tracking). */
function countTriple(line: string): number {
  let count = 0;
  let i = 0;
  while (i < line.length) {
    if (line.startsWith('"""', i) || line.startsWith("'''", i)) {
      count++;
      i += 3;
    } else {
      i++;
    }
  }
  return count;
}

/** Match a `def` at lines[i], joining continued signature lines for `-> Ret`. */
function matchDef(lines: readonly string[], i: number): { name: string; returns: string | null; nextLine: number } | null {
  const first = lines[i] ?? "";
  const head = DEF_RE.exec(first.trim());
  if (head === null || head[1] === undefined) {
    return null;
  }
  let signature = first;
  let j = i;
  let depth = 0;
  for (const ch of first) {
    if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth--;
    }
  }
  while (depth > 0 && j + 1 < lines.length) {
    j++;
    const extra = lines[j] ?? "";
    signature += "\n" + extra;
    for (const ch of extra) {
      if (ch === "(") {
        depth++;
      } else if (ch === ")") {
        depth--;
      }
    }
  }
  const returns = /\)\s*->\s*([^:]+?)\s*:\s*(?:#|$)/.exec(signature.replace(/\n/g, " "));
  return { name: head[1], returns: returns?.[1]?.trim() ?? null, nextLine: j + 1 };
}
