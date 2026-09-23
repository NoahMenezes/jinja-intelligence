import { toFsPath } from "../utils/paths.js";
import { DEFAULT_SKIP_DIRS, MAX_INDEX_FILES, walkRoots, type ScanFs } from "./scanner.js";
import { TemplateIndex } from "./template-index.js";

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
  private scanned = false;

  constructor(
    private readonly options: ProjectOptions,
    private readonly fs: ProjectFs,
  ) {}

  isScanned(): boolean {
    return this.scanned;
  }

  /** Full scan. Async; safe to run in the background after initialize. */
  async scan(openDocuments?: ReadonlyMap<string, string>): Promise<ProjectStats> {
    const roots = this.options.roots
      .map((uri) => toFsPath(uri))
      .filter((p): p is string => p !== null);
    const { files, capped, skipped } = await walkRoots(
      roots,
      { extensions: this.options.extensions, skipDirs: DEFAULT_SKIP_DIRS, maxFiles: MAX_INDEX_FILES },
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
    this.scanned = true;
    return { files: this.index.size(), capped, skipped };
  }

  /** Editor open/change: index the live text, shadowing disk. */
  upsert(uri: string, text: string): void {
    try {
      this.index.upsert(uri, text, true);
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
        return;
      }
      const text = await this.read(path);
      if (text === null) {
        this.index.remove(uri);
        return;
      }
      this.index.upsert(uri, text, false);
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
        return;
      }
      // Respect open documents: never clobber live editor text.
      if (this.index.get(uri)?.fromEditor === true) {
        return;
      }
      this.index.upsert(uri, text, false);
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
}
