import {
  ProposedFeatures,
  TextDocumentSyncKind,
  TextDocuments,
  createConnection,
  type Connection,
  type InitializeParams,
  type InitializeResult,
} from "vscode-languageserver/node.js";
import { TextDocument } from "vscode-languageserver-textdocument";
import { SERVER_NAME, SERVER_VERSION } from "../index.js";
import { resolveSettings } from "../config/settings.js";
import { createLogger, type Logger } from "../utils/logging.js";
import { publishDiagnostics } from "../features/diagnostics/diagnostics.js";
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

  connection.onInitialize((params: InitializeParams): InitializeResult => {
    try {
      const settings = resolveSettings(
        (params.initializationOptions as Record<string, unknown> | undefined)?.["jinjaIntelligence"] as
          | Record<string, unknown>
          | undefined,
      );
      logger.info(`Initializing ${SERVER_NAME} ${SERVER_VERSION} (sync=${TextDocumentSyncKind.Full}, settings=${JSON.stringify(settings)})`);
      void params;
      return createInitializeResult(SERVER_NAME, SERVER_VERSION);
    } catch (error) {
      logger.error(`initialize failed: ${String(error)}`);
      return createInitializeResult(SERVER_NAME, SERVER_VERSION);
    }
  });

  connection.onInitialized((): void => {
    try {
      logger.info(`${SERVER_NAME} initialized.`);
    } catch (error) {
      logger.error(`initialized handler failed: ${String(error)}`);
    }
  });

  connection.onDidChangeConfiguration((change): void => {
    try {
      const raw = (change.settings as Record<string, unknown> | undefined)?.["jinjaIntelligence"];
      resolveSettings(raw as Record<string, unknown> | undefined);
      logger.info("Configuration updated.");
    } catch (error) {
      logger.error(`configuration handler failed: ${String(error)}`);
    }
  });

  connection.onShutdown((): void => {
    lifecycle.markShutdown();
    logger.info("Shutdown requested.");
  });

  documents.onDidOpen((event): void => {
    try {
      sync.applyTextDocument(event.document);
      publishDiagnostics(connection, event.document.uri, event.document.version, event.document.getText());
    } catch (error) {
      logger.error(`didOpen handler failed: ${String(error)}`);
    }
  });

  documents.onDidChangeContent((event): void => {
    try {
      sync.didChange(event.document.uri, event.document.getText(), event.document.version);
      publishDiagnostics(connection, event.document.uri, event.document.version, event.document.getText());
    } catch (error) {
      logger.error(`didChange handler failed: ${String(error)}`);
    }
  });

  documents.onDidClose((event): void => {
    try {
      sync.didClose(event.document.uri);
      connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
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
