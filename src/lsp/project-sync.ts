import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import type { Connection } from "vscode-languageserver/node.js";
import { Project, type ProjectFs } from "../project/project.js";
import { toFileUri, toFsPath } from "../utils/paths.js";
import type { Logger } from "../utils/logging.js";

/** Node filesystem adapter for project scanning. Overridable in tests. */
export const NODE_FS: ProjectFs = {
  readdir: (path: string) => nodeFs.promises.readdir(path),
  stat: (path: string) => nodeFs.promises.stat(path),
  realpath: (path: string) => nodeFs.promises.realpath(path),
  readFile: async (path: string) => {
    try {
      return await nodeFs.promises.readFile(path, "utf8");
    } catch {
      return null;
    }
  },
  statFile: async (path: string) => {
    try {
      const st = await nodeFs.promises.stat(path);
      return { mtimeMs: st.mtimeMs };
    } catch {
      return null;
    }
  },
};

/**
 * Project lifecycle: roots, background scans, open-document shadowing, and
 * debounced external updates. Extracted from connection.ts so the server
 * entry stays wiring-only. Every method is guarded; failures become log
 * lines, never protocol errors.
 */
export class ProjectSync {
  private project: Project | null = null;
  private roots: string[] = [];
  private templateDirs: string[] = [];
  private extensions: string[] = [];
  private watchSupported = false;
  private fallbackApplied = false;
  private watchTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pendingRefresh = new Set<string>();
  private readonly pendingRemovals = new Set<string>();

  constructor(
    private readonly logger: Logger,
    private readonly getOpenDocuments: () => ReadonlyMap<string, string>,
    private readonly fs: ProjectFs = NODE_FS,
  ) {}

  getProject(): Project | null {
    return this.project;
  }

  getRoots(): readonly string[] {
    return this.roots;
  }

  getTemplateDirs(): readonly string[] {
    return this.templateDirs;
  }

  setWatchSupported(supported: boolean): void {
    this.watchSupported = supported;
  }

  /** (Re)build the project shell; the scan itself runs in the background. */
  configure(roots: readonly string[], templateDirs: readonly string[], extensions: readonly string[]): void {
    try {
      this.roots = [...roots];
      this.templateDirs = [...templateDirs];
      this.extensions = [...extensions];
      this.project = new Project({ roots: this.roots, extensions: this.extensions, templateDirs: this.templateDirs }, this.fs);
    } catch (error) {
      this.logger.error(`project rebuild failed: ${String(error)}`);
      this.project = null;
    }
  }

  /** Background scan with the currently open documents applied on top. */
  scan(): void {
    const current = this.project;
    if (current === null) {
      return;
    }
    let open: ReadonlyMap<string, string>;
    try {
      open = this.getOpenDocuments();
    } catch (error) {
      this.logger.error(`open-document snapshot failed: ${String(error)}`);
      return;
    }
    void current
      .scan(open)
      .then((stats) => {
        this.logger.info(
          `Project indexed: ${stats.files} templates${stats.capped ? " (capped)" : ""}${stats.skipped.length > 0 ? `, ${stats.skipped.length} skipped` : ""}.`,
        );
      })
      .catch((error: unknown) => {
        this.logger.error(`project scan failed: ${String(error)}`);
      });
  }

  /** Editor open/change: index live text, applying the fallback root once. */
  opened(uri: string, text: string): void {    try {
      this.applyFallbackRoot(uri);
      this.project?.upsert(uri, text);
    } catch (error) {
      this.logger.error(`project open failed: ${String(error)}`);
    }
  }

  /** Editor change: index live text (fallback already handled at open). */
  changed(uri: string, text: string): void {
    try {
      this.project?.upsert(uri, text);
    } catch (error) {
      this.logger.error(`project change failed: ${String(error)}`);
    }
  }

  /** Editor close: revert to disk content. */
  closed(uri: string): void {
    const current = this.project;
    if (current === null) {
      return;
    }
    void current.revertToDisk(uri).catch((error: unknown) => {
      this.logger.error(`disk revert failed: ${String(error)}`);
    });
  }

  /** External file event, debounced trailing-edge for burst safety. */
  watched(uri: string, deleted: boolean): void {
    if (deleted) {
      this.pendingRemovals.add(uri);
    } else {
      const fsPath = toFsPath(uri);
      if (fsPath !== null) {
        this.pendingRefresh.add(fsPath);
      }
    }
    if (this.watchTimer !== null) {
      clearTimeout(this.watchTimer);
    }
    this.watchTimer = setTimeout(() => this.flushWatched(), 500);
  }

  /** Register file watching when the client supports it; silent otherwise. */
  async registerWatchers(connection: Pick<Connection, "sendRequest">): Promise<void> {
    if (!this.watchSupported) {
      return;
    }
    await connection.sendRequest("client/registerCapability", {
      registrations: [
        {
          id: "jinja-templates",
          method: "workspace/didChangeWatchedFiles",
          registerOptions: { watchers: [{ globPattern: "**/*.{j2,jinja,jinja2,html}" }] },
        },
      ],
    });
    this.logger.info("Watching template files for external changes.");
  }

  private flushWatched(): void {
    this.watchTimer = null;
    const current = this.project;
    if (current === null) {
      this.pendingRefresh.clear();
      this.pendingRemovals.clear();
      return;
    }
    for (const uri of this.pendingRemovals) {
      try {
        current.index.remove(uri);
      } catch (error) {
        this.logger.error(`index removal failed: ${String(error)}`);
      }
    }
    this.pendingRemovals.clear();
    const paths = [...this.pendingRefresh];
    this.pendingRefresh.clear();
    void (async () => {
      for (const fsPath of paths) {
        await current.refreshPath(fsPath);
      }
      await current.prune();
    })().catch((error: unknown) => {
      this.logger.error(`index refresh failed: ${String(error)}`);
    });
  }

  // Set once: when no workspace arrives, the first opened file's directory
  // becomes the fallback root so single files work with zero configuration.
  private applyFallbackRoot(uri: string): void {
    if (this.fallbackApplied || this.roots.length > 0) {
      return;
    }
    try {
      const fsPath = toFsPath(uri);
      if (fsPath === null) {
        return;
      }
      const dirUri = toFileUri(nodePath.dirname(fsPath));
      if (dirUri === null) {
        return;
      }
      this.fallbackApplied = true;
      this.configure([dirUri], this.templateDirs, this.extensions);
      this.scan();
      this.logger.info(`No workspace root received; indexing ${dirUri} as fallback.`);
    } catch (error) {
      this.logger.error(`fallback root failed: ${String(error)}`);
    }
  }
}
