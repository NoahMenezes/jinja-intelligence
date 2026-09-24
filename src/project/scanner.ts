/** Minimal filesystem surface for scanning. Injected so tests use a fake. */
export interface ScanFs {
  readdir(path: string): Promise<readonly string[]>;
  stat(path: string): Promise<{ isDirectory(): boolean; isFile(): boolean }>;
  /** Canonical path for cycle detection; defaults to identity when absent. */
  realpath?(path: string): Promise<string>;
}

export interface ScanOptions {
  /** Template extensions, lowercase with dot (e.g. ".j2"). */
  readonly extensions: readonly string[];
  /** Python extensions collected for context extraction (e.g. [".py"]). */
  readonly pythonExtensions: readonly string[];
  /** Directory basenames to skip. */
  readonly skipDirs: readonly string[];
  /** Hard cap on collected files. */
  readonly maxFiles: number;
}

export const DEFAULT_SKIP_DIRS: readonly string[] = [
  "node_modules",
  ".git",
  "dist",
  "__pycache__",
  ".venv",
  ".tox",
  "build",
  "coverage",
];

export const MAX_INDEX_FILES = 2000;

export interface ScanResult {
  /** Absolute template-candidate paths, in walk order. */
  readonly files: readonly string[];
  /** Absolute Python-candidate paths, in walk order. */
  readonly python: readonly string[];
  /** True when the walk stopped early at the cap. */
  readonly capped: boolean;
  /** Directories skipped for unreadability (diagnostic aid). */
  readonly skipped: readonly string[];
}

/**
 * Recursively collect template-candidate files under roots. Async and
 * bounded; unreadable entries are skipped, never thrown. `.html` files are
 * included as candidates (marker-gated later at read time).
 */
export async function walkRoots(
  roots: readonly string[],
  options: ScanOptions,
  fs: ScanFs,
): Promise<ScanResult> {
  const files: string[] = [];
  const python: string[] = [];
  const skipped: string[] = [];
  let capped = false;
  const extensions = new Set(options.extensions.map((e) => e.toLowerCase()));
  const pythonExtensions = new Set(options.pythonExtensions.map((e) => e.toLowerCase()));
  const skipDirs = new Set(options.skipDirs);
  /** Canonicalized directories already walked: symlink cycles terminate here. */
  const visited = new Set<string>();

  function count(): number {
    return files.length + python.length;
  }

  async function canonical(dir: string): Promise<string> {
    try {
      if (fs.realpath !== undefined) {
        return await fs.realpath(dir);
      }
    } catch {
      // Fall through to the raw path.
    }
    return dir;
  }

  async function walk(dir: string): Promise<void> {
    if (count() >= options.maxFiles) {
      capped = true;
      return;
    }
    const id = await canonical(dir);
    if (visited.has(id)) {
      return;
    }
    visited.add(id);
    let entries: readonly string[];
    try {
      entries = await fs.readdir(dir);
    } catch {
      skipped.push(dir);
      return;
    }
    const sorted = [...entries].sort();
    for (const entry of sorted) {
      if (count() >= options.maxFiles) {
        capped = true;
        return;
      }
      if (entry === "." || entry === "..") {
        continue;
      }
      const full = `${dir}/${entry}`.replace(/\/+/g, "/");
      let st: { isDirectory(): boolean; isFile(): boolean };
      try {
        st = await fs.stat(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (entry.startsWith(".") || skipDirs.has(entry)) {
          continue;
        }
        await walk(full);
      } else if (st.isFile()) {
        const dot = entry.lastIndexOf(".");
        const ext = dot === -1 ? "" : entry.slice(dot).toLowerCase();
        if (extensions.has(ext) || ext === ".html") {
          files.push(full);
        } else if (pythonExtensions.has(ext)) {
          python.push(full);
        }
        if (count() >= options.maxFiles) {
          capped = true;
          return;
        }
      }
    }
  }

  for (const root of roots) {
    await walk(root);
    if (capped) {
      break;
    }
  }
  return { files, python, capped, skipped };
}
