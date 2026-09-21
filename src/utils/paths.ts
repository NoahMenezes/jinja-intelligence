import * as nodePath from "node:path";
import { URI } from "vscode-uri";
import type { UriString } from "../types/index.js";

/** Convert a filesystem path to a file URI. Returns null on empty input. */
export function toFileUri(fsPath: string): UriString | null {
  if (fsPath.trim().length === 0) {
    return null;
  }
  try {
    return URI.file(nodePath.resolve(fsPath)).toString() as UriString;
  } catch {
    return null;
  }
}

/** Convert a URI string to a filesystem path. Returns null when unparseable. */
export function toFsPath(uri: string): string | null {
  if (uri.trim().length === 0) {
    return null;
  }
  // vscode-uri is lenient (bare paths parse as file URIs), so require an
  // explicit scheme for editor-provided URIs.
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(uri)) {
    return null;
  }
  try {
    return URI.parse(uri).fsPath;
  } catch {
    return null;
  }
}

/** True when `child` is inside `parent` (normalized, POSIX-first, case-sensitive). */
export function isChildOf(child: string, parent: string): boolean {
  const normalizedParent = nodePath.normalize(parent);
  const normalizedChild = nodePath.normalize(child);
  const withSep = normalizedParent.endsWith(nodePath.sep)
    ? normalizedParent
    : normalizedParent + nodePath.sep;
  return normalizedChild === normalizedParent || normalizedChild.startsWith(withSep);
}

/** Lowercase extension including dot (e.g. ".jinja2"), or "" when none. */
export function extensionOf(filePath: string): string {
  return nodePath.extname(filePath).toLowerCase();
}

/** Join path segments with normalization. */
export function joinPath(...segments: string[]): string {
  return nodePath.normalize(nodePath.join(...segments));
}
