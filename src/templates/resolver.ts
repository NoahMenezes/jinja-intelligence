import * as nodePath from "node:path";
import { toFileUri, toFsPath } from "../utils/paths.js";

export interface ResolveRequest {
  /** URI of the referring document. */
  readonly fromUri: string;
  /** Literal template path as written (e.g. "base.html"). */
  readonly name: string;
  /** Workspace roots as file URIs, in priority order. */
  readonly roots: readonly string[];
  /** Extra template directories: absolute paths or root-relative. */
  readonly templateDirs: readonly string[];
}

/**
 * Resolve a template name to a file URI. Pure except for the injected
 * `exists` check: tries the referring file's directory, then each root,
 * each root + "templates/", then configured template directories.
 * Returns null when nothing exists. Total, never throws.
 */
export function resolveTemplate(request: ResolveRequest, exists: (fsPath: string) => boolean): string | null {
  try {
    const fromPath = toFsPath(request.fromUri);
    if (fromPath === null) {
      return null;
    }
    const name = request.name.trim();
    if (name.length === 0) {
      return null;
    }
    const candidates: string[] = [nodePath.resolve(nodePath.dirname(fromPath), name)];
    const rootPaths: string[] = [];
    for (const root of request.roots) {
      const rootPath = toFsPath(root);
      if (rootPath === null) {
        continue;
      }
      rootPaths.push(rootPath);
      candidates.push(nodePath.resolve(rootPath, name));
      candidates.push(nodePath.resolve(rootPath, "templates", name));
    }
    for (const dir of request.templateDirs) {
      if (dir.trim().length === 0) {
        continue;
      }
      if (nodePath.isAbsolute(dir)) {
        candidates.push(nodePath.resolve(dir, name));
      } else {
        for (const rootPath of rootPaths) {
          candidates.push(nodePath.resolve(rootPath, dir, name));
        }
      }
    }
    for (const candidate of candidates) {
      let ok = false;
      try {
        ok = exists(candidate);
      } catch {
        ok = false;
      }
      if (ok) {
        return toFileUri(candidate);
      }
    }
    return null;
  } catch {
    return null;
  }
}
