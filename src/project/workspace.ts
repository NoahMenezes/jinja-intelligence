/** Workspace root extraction. Pure; seeds the Phase 16 project engine. */
export interface InitializeRoots {
  readonly rootUri?: string | null;
  readonly rootPath?: string | null;
  readonly workspaceFolders?: readonly { readonly uri: string }[] | null;
}

/**
 * Resolve workspace roots as file URIs in priority order:
 * rootUri, then rootPath, then workspace folders. Non-file schemes and
 * invalid entries are dropped. Total, never throws.
 */
export function rootsFromInitialize(params: InitializeRoots): string[] {
  try {
    const roots: string[] = [];
    const push = (uri: string | null | undefined): void => {
      if (typeof uri !== "string" || uri.trim().length === 0) {
        return;
      }
      if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(uri)) {
        return;
      }
      if (uri.startsWith("file://") && !roots.includes(uri)) {
        roots.push(uri);
      }
    };
    push(params.rootUri ?? undefined);
    const rootPath = params.rootPath;
    if (typeof rootPath === "string" && rootPath.trim().length > 0) {
      push(`file://${rootPath}`);
    }
    const folders = params.workspaceFolders;
    if (Array.isArray(folders)) {
      for (const folder of folders) {
        push(folder?.uri);
      }
    }
    return roots;
  } catch {
    return [];
  }
}
