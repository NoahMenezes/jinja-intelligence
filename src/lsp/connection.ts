import * as nodeFs from "node:fs";
import * as nodePath from "node:path";
import {
  FileChangeType,
  ProposedFeatures,
  TextDocumentSyncKind,
  TextDocuments,
  createConnection,
  type CompletionItem,
  type Connection,
  type Definition,
  type DocumentSymbol,
  type Hover,
  type InitializeParams,
  type InitializeResult,
  type Location,
  type SemanticTokens,
  type SignatureHelp,
  type SymbolInformation,
  type WorkspaceEdit,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { SERVER_NAME, SERVER_VERSION } from "../index.js";
import type { UriString } from "../types/index.js";
import { resolveSettings } from "../config/settings.js";
import { createLogger, type Logger } from "../utils/logging.js";
import { publishDiagnostics } from "../features/diagnostics/diagnostics.js";
import { complete } from "../features/completion/completion.js";
import { definition } from "../features/definition/definition.js";
import { hover } from "../features/hover/hover.js";
import { references } from "../features/references/references.js";
import { rename } from "../features/rename/rename.js";
import { signatureHelp } from "../features/signature-help/signature-help.js";
import { documentSymbols, indexWorkspaceSymbols, workspaceSymbols } from "../features/symbols/symbols.js";
import { semanticTokens } from "../features/semantic-tokens/semantic-tokens.js";
import { Project, type ProjectFs } from "../project/project.js";
import { toFileUri, toFsPath } from "../utils/paths.js";
import { rootsFromInitialize } from "../project/workspace.js";
import { DocumentSync } from "./document-sync.js";
import { createInitializeResult, Lifecycle } from "./lifecycle.js";

export interface Server {
  readonly connection: Connection;
  readonly sync: DocumentSync;
  readonly lifecycle: Lifecycle;
  readonly logger: Logger;
  start(): void;
}

/**
 * Create the LSP server: stdio connection, document sync, lifecycle.
 * Handlers never throw across the connection boundary; every body is
 * guarded and degrades to a log line.
 */
export function createServer(): Server {
  const connection = createConnection(ProposedFeatures.all);
  const logger = createLogger(connection);
  const lifecycle = new Lifecycle();
  const sync = new DocumentSync(logger);
  const documents = new TextDocuments(TextDocument);
  let roots: string[] = [];
  let templateDirs: string[] = [];
  let extensions: string[] = [];
  let project: Project | null = null;
  let watchSupported = false;

  const NODE_FS: ProjectFs = {
    readdir: (path: string) => nodeFs.promises.readdir(path),
    stat: (path: string) => nodeFs.promises.stat(path),
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

  /** (Re)build the project shell; the scan itself runs in the background. */
  function rebuildProject(): void {
    try {
      project = new Project({ roots, extensions, templateDirs }, NODE_FS);
    } catch (error) {
      logger.error(`project rebuild failed: ${String(error)}`);
      project = null;
    }
  }

  /** Background scan with the currently open documents applied on top. */
  function scanInBackground(): void {
    const current = project;
    if (current === null) {
      return;
    }
    const open = new Map<string, string>();
    for (const uri of sync.manager.uris()) {
      const document = sync.manager.get(uri);
      if (document !== null) {
        open.set(uri, document.text);
      }
    }
    void current
      .scan(open)
      .then((stats) => {
        logger.info(
          `Project indexed: ${stats.files} templates${stats.capped ? " (capped)" : ""}${stats.skipped.length > 0 ? `, ${stats.skipped.length} skipped` : ""}.`,
        );
      })
      .catch((error: unknown) => {
        logger.error(`project scan failed: ${String(error)}`);
      });
  }

  // Set once: when no workspace arrives, the first opened file's directory
  // becomes the fallback root so single files work with zero configuration.
  let fallbackApplied = false;

  function applyFallbackRoot(uri: string): void {
    if (fallbackApplied || roots.length > 0) {
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
      fallbackApplied = true;
      roots = [dirUri];
      rebuildProject();
      scanInBackground();
      logger.info(`No workspace root received; indexing ${dirUri} as fallback.`);
    } catch (error) {
      logger.error(`fallback root failed: ${String(error)}`);
    }
  }

  // Trailing-edge debounce for external file-event bursts (git checkouts etc).
  let watchTimer: ReturnType<typeof setTimeout> | null = null;
  const pendingRefresh = new Set<string>();
  const pendingRemovals = new Set<string>();

  function flushWatched(): void {
    watchTimer = null;
    const current = project;
    if (current === null) {
      pendingRefresh.clear();
      pendingRemovals.clear();
      return;
    }
    for (const uri of pendingRemovals) {
      try {
        current.index.remove(uri);
      } catch (error) {
        logger.error(`index removal failed: ${String(error)}`);
      }
    }
    pendingRemovals.clear();
    const paths = [...pendingRefresh];
    pendingRefresh.clear();
    void (async () => {
      for (const fsPath of paths) {
        await current.refreshPath(fsPath);
      }
    })().catch((error: unknown) => {
      logger.error(`index refresh failed: ${String(error)}`);
    });
  }

  function scheduleWatched(uri: string, deleted: boolean): void {
    if (deleted) {
      pendingRemovals.add(uri);
    } else {
      const fsPath = toFsPath(uri);
      if (fsPath !== null) {
        pendingRefresh.add(fsPath);
      }
    }
    if (watchTimer !== null) {
      clearTimeout(watchTimer);
    }
    watchTimer = setTimeout(flushWatched, 500);
  }

  connection.onInitialize((params: InitializeParams): InitializeResult => {
    try {
      const settings = resolveSettings(
        (params.initializationOptions as Record<string, unknown> | undefined)?.["jinjaIntelligence"] as
          | Record<string, unknown>
          | undefined,
      );
      roots = rootsFromInitialize(params);
      templateDirs = [...settings.templateDirectories];
      extensions = [...settings.templateExtensions];
      rebuildProject();
      try {
        const workspace = params.capabilities as
          | { workspace?: { didChangeWatchedFiles?: { dynamicRegistration?: boolean } } }
          | undefined;
        watchSupported = workspace?.workspace?.didChangeWatchedFiles?.dynamicRegistration === true;
      } catch {
        watchSupported = false;
      }
      logger.info(`Initializing ${SERVER_NAME} ${SERVER_VERSION} (sync=${TextDocumentSyncKind.Full}, roots=${JSON.stringify(roots)}, settings=${JSON.stringify(settings)})`);
      return createInitializeResult(SERVER_NAME, SERVER_VERSION);
    } catch (error) {
      logger.error(`initialize failed: ${String(error)}`);
      return createInitializeResult(SERVER_NAME, SERVER_VERSION);
    }
  });

  connection.onInitialized((): void => {
    try {
      logger.info(`${SERVER_NAME} initialized.`);
      scanInBackground();
      void registerWatchers().catch((error: unknown) => {
        logger.error(`watch registration failed: ${String(error)}`);
      });
    } catch (error) {
      logger.error(`initialized handler failed: ${String(error)}`);
    }
  });

  /** Register file watching when the client supports it; silent otherwise. */
  async function registerWatchers(): Promise<void> {
    if (!watchSupported) {
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
    logger.info("Watching template files for external changes.");
  }

  connection.onDidChangeConfiguration((change): void => {
    try {
      const raw = (change.settings as Record<string, unknown> | undefined)?.["jinjaIntelligence"];
      const settings = resolveSettings(raw as Record<string, unknown> | undefined);
      templateDirs = [...settings.templateDirectories];
      extensions = [...settings.templateExtensions];
      rebuildProject();
      scanInBackground();
      logger.info("Configuration updated.");
    } catch (error) {
      logger.error(`configuration handler failed: ${String(error)}`);
    }
  });

  connection.onDidChangeWatchedFiles((params): void => {
    try {
      for (const change of params.changes) {
        scheduleWatched(change.uri, change.type === FileChangeType.Deleted);
      }
    } catch (error) {
      logger.error(`watched-files handler failed: ${String(error)}`);
    }
  });

  connection.onShutdown((): void => {
    lifecycle.markShutdown();
    logger.info("Shutdown requested.");
  });

  connection.onCompletion((params): CompletionItem[] => {
    try {
      const document = sync.manager.get(params.textDocument.uri as UriString);
      if (document === null) {
        return [];
      }
      const names = project?.isScanned() === true ? project.index.basenames() : undefined;
      return names === undefined
        ? complete(document.text, document.offsetAt(params.position))
        : complete(document.text, document.offsetAt(params.position), { templateNames: names });
    } catch (error) {
      logger.error(`completion handler failed: ${String(error)}`);
      return [];
    }
  });

  connection.onHover((params): Hover | null => {
    try {
      const document = sync.manager.get(params.textDocument.uri as UriString);
      if (document === null) {
        return null;
      }
      return hover(document.text, document.offsetAt(params.position));
    } catch (error) {
      logger.error(`hover handler failed: ${String(error)}`);
      return null;
    }
  });

  connection.onDefinition((params): Definition | null => {
    try {
      const document = sync.manager.get(params.textDocument.uri as UriString);
      if (document === null) {
        return null;
      }
      const found: Location | null = definition(document.text, params.textDocument.uri, document.offsetAt(params.position), {
        roots,
        templateDirs,
      });
      return found;
    } catch (error) {
      logger.error(`definition handler failed: ${String(error)}`);
      return null;
    }
  });

  connection.onReferences((params): Location[] | null => {
    try {
      const document = sync.manager.get(params.textDocument.uri as UriString);
      if (document === null) {
        return null;
      }
      return references(
        document.text,
        params.textDocument.uri,
        document.offsetAt(params.position),
        params.context.includeDeclaration,
      );
    } catch (error) {
      logger.error(`references handler failed: ${String(error)}`);
      return null;
    }
  });

  connection.onRenameRequest((params): WorkspaceEdit | null => {
    try {
      const document = sync.manager.get(params.textDocument.uri as UriString);
      if (document === null) {
        return null;
      }
      return rename(document.text, params.textDocument.uri, document.offsetAt(params.position), params.newName);
    } catch (error) {
      logger.error(`rename handler failed: ${String(error)}`);
      return null;
    }
  });

  connection.onDocumentSymbol((params): DocumentSymbol[] => {
    try {
      const document = sync.manager.get(params.textDocument.uri as UriString);
      if (document === null) {
        return [];
      }
      return documentSymbols(document.text);
    } catch (error) {
      logger.error(`documentSymbol handler failed: ${String(error)}`);
      return [];
    }
  });

  connection.onWorkspaceSymbol((params): SymbolInformation[] => {
    try {
      const current = project;
      if (current !== null && current.isScanned()) {
        return indexWorkspaceSymbols(current.index, params.query);
      }
      const out: SymbolInformation[] = [];
      for (const uri of sync.manager.uris()) {
        const document = sync.manager.get(uri);
        if (document === null) {
          continue;
        }
        out.push(...workspaceSymbols(document.text, uri, params.query));
      }
      return out;
    } catch (error) {
      logger.error(`workspaceSymbol handler failed: ${String(error)}`);
      return [];
    }
  });

  connection.onSignatureHelp((params): SignatureHelp | null => {
    try {
      const document = sync.manager.get(params.textDocument.uri as UriString);
      if (document === null) {
        return null;
      }
      return signatureHelp(document.text, document.offsetAt(params.position));
    } catch (error) {
      logger.error(`signatureHelp handler failed: ${String(error)}`);
      return null;
    }
  });

  connection.languages.semanticTokens.on((params): SemanticTokens => {
    try {
      const document = sync.manager.get(params.textDocument.uri as UriString);
      if (document === null) {
        return { data: [] };
      }
      return semanticTokens(document.text);
    } catch (error) {
      logger.error(`semanticTokens handler failed: ${String(error)}`);
      return { data: [] };
    }
  });

  documents.onDidOpen((event): void => {
    try {
      sync.applyTextDocument(event.document);
      applyFallbackRoot(event.document.uri);
      project?.upsert(event.document.uri, event.document.getText());
      publishDiagnostics(connection, event.document.uri, event.document.version, event.document.getText());
    } catch (error) {
      logger.error(`didOpen handler failed: ${String(error)}`);
    }
  });

  documents.onDidChangeContent((event): void => {
    try {
      sync.didChange(event.document.uri, event.document.getText(), event.document.version);
      project?.upsert(event.document.uri, event.document.getText());
      publishDiagnostics(connection, event.document.uri, event.document.version, event.document.getText());
    } catch (error) {
      logger.error(`didChange handler failed: ${String(error)}`);
    }
  });

  documents.onDidClose((event): void => {
    try {
      sync.didClose(event.document.uri);
      connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
      const current = project;
      if (current !== null) {
        void current.revertToDisk(event.document.uri).catch((error: unknown) => {
          logger.error(`disk revert failed: ${String(error)}`);
        });
      }
    } catch (error) {
      logger.error(`didClose handler failed: ${String(error)}`);
    }
  });

  function start(): void {
    documents.listen(connection);
    connection.listen();
  }

  return { connection, sync, lifecycle, logger, start };
}
