import { toFsPath } from "../utils/paths.js";
import { DEFAULT_SKIP_DIRS, MAX_INDEX_FILES, walkRoots, type ScanFs } from "./scanner.js";
import { TemplateIndex } from "./template-index.js";
import { PythonIndex, buildContext, contextFor, type TemplateContext } from "../python/context.js";
import type { RenderCall } from "../python/scanner.js";

export interface ProjectFs extends ScanFs {
  readFile(path: string): Promise<string | null>;
  statFile(path: string): Promise<{ mtimeMs: number } | null>;
}

export interface ProjectOptions {
  readonly roots: readonly string[];
  readonly extensions: readonly string[];
  readonly templateDirs: readonly string[];
}

export interface ProjectStats {
  readonly files: number;
  readonly capped: boolean;
  readonly skipped: readonly string[];
}

/** Marker fragments identifying Jinja content inside `.html` files. */
const JINJA_MARKERS: readonly string[] = ["{{", "{%", "{#"];

/**
 * Owns one workspace root's template index: initial async scan plus
 * incremental freshness. Open editor documents shadow disk content.
 * Total on IO failures; external bursts are debounced by the caller.
 */
export class Project {
  readonly index = new TemplateIndex();
  readonly python = new PythonIndex();
  private scanned = false;

  constructor(
    private readonly options: ProjectOptions,
    private readonly fs: ProjectFs,
  ) {}

  isScanned(): boolean {
    return this.scanned;
  }

  /** Python-provided context for a template file, or null. Built on demand. */
  templateContext(templateUri: string): TemplateContext | null {
    try {
      const files = new Map<string, { calls: readonly RenderCall[]; text: string }>();
      for (const uri of this.python.uris()) {
        files.set(uri, { calls: this.python.get(uri), text: this.python.text(uri) ?? "" });
      }
      return contextFor(buildContext(files), templateUri);
    } catch {
      return null;
    }
  }

  /** Full scan. Async; safe to run in the background after initialize. */
  async scan(openDocuments?: ReadonlyMap<string, string>): Promise<ProjectStats> {
    const roots = this.options.roots
      .map((uri) => toFsPath(uri))
      .filter((p): p is string => p !== null);
    const { files, python, capped, skipped } = await walkRoots(
      roots,
      {
        extensions: this.options.extensions,
        pythonExtensions: [".py"],
        skipDirs: DEFAULT_SKIP_DIRS,
        maxFiles: MAX_INDEX_FILES,
      },
      this.fs,
    );
    for (const path of files) {
      const uri = `file://${path}`;
      const open = openDocuments?.get(uri);
      if (open !== undefined) {
        this.index.upsert(uri, open, true);
        continue;
      }
      const text = await this.read(path);
      if (text === null) {
        continue;
      }
      if (path.toLowerCase().endsWith(".html") && !JINJA_MARKERS.some((m) => text.includes(m))) {
        continue;
      }
      this.index.upsert(uri, text, false);
    }
    for (const path of python) {
      const uri = `file://${path}`;
      const open = openDocuments?.get(uri);
      if (open !== undefined) {
        this.python.upsert(uri, open);
        continue;
      }
      const text = await this.read(path);
      if (text === null) {
        continue;
      }
      this.python.upsert(uri, text);
    }
    this.scanned = true;
    return { files: this.index.size(), capped, skipped };
  }

  /** Editor open/change: index the live text, shadowing disk. */
  upsert(uri: string, text: string): void {
    try {
      if (isPythonPath(uri)) {
        this.python.upsert(uri, text);
        return;
      }
      if (isTemplatePath(uri, this.options.extensions, text)) {
        this.index.upsert(uri, text, true);
      }
    } catch {
      // Freshness must never break request handling.
    }
  }

  /** Editor close: revert to disk content (or drop when the file is gone). */
  async revertToDisk(uri: string): Promise<void> {
    try {
      const path = toFsPath(uri);
      if (path === null) {
        this.index.remove(uri);
        this.python.remove(uri);
        return;
      }
      const text = await this.read(path);
      if (text === null) {
        this.index.remove(uri);
        this.python.remove(uri);
        return;
      }
      if (isPythonPath(uri)) {
        this.python.upsert(uri, text);
        return;
      }
      if (isTemplatePath(uri, this.options.extensions, text)) {
        this.index.upsert(uri, text, false);
      } else {
        this.index.remove(uri);
      }
    } catch {
      // ignore
    }
  }

  /** External file event (watched-files or manual refresh). */
  async refreshPath(fsPath: string): Promise<void> {
    try {
      const text = await this.read(fsPath);
      const uri = `file://${fsPath}`;
      if (text === null) {
        this.index.remove(uri);
        this.python.remove(uri);
        return;
      }
      // Respect open documents: never clobber live editor text.
      if (this.index.get(uri)?.fromEditor === true) {
        return;
      }
      if (isPythonPath(uri)) {
        this.python.upsert(uri, text);
        return;
      }
      if (isTemplatePath(uri, this.options.extensions, text)) {
        this.index.upsert(uri, text, false);
      }
    } catch {
      // ignore
    }
  }

  private async read(path: string): Promise<string | null> {
    try {
      return await this.fs.readFile(path);
    } catch {
      return null;
    }
  }

  /**
   * Drop indexed files missing from disk. Watched deletions already remove
   * entries; this catches events from clients without file watching.
   * Returns the number dropped. Total, never throws.
   */
  async prune(): Promise<number> {
    let dropped = 0;
    try {
      const uris = new Set<string>([...this.index.uris(), ...this.python.uris()]);
      for (const uri of uris) {
        const path = toFsPath(uri);
        if (path === null) {
          continue;
        }
        try {
          await this.fs.stat(path);
        } catch {
          this.index.remove(uri);
          this.python.remove(uri);
          dropped++;
        }
      }
    } catch {
      // ignore
    }
    return dropped;
  }
}

function isPythonPath(uri: string): boolean {
  return uri.toLowerCase().endsWith(".py");
}

/** Template extensions always count; `.html` needs a Jinja marker. */
function isTemplatePath(uri: string, extensions: readonly string[], text: string): boolean {
  const lower = uri.toLowerCase();
  if (extensions.some((e) => lower.endsWith(e.toLowerCase()))) {
    return true;
  }
  return lower.endsWith(".html") && JINJA_MARKERS.some((m) => text.includes(m));
}
