import type { TextDocument } from "vscode-languageserver-textdocument";
import type { DocumentVersion, UriString } from "../types/index.js";
import type { Logger } from "../utils/logging.js";
import { DocumentManager } from "../documents/document-manager.js";

/**
 * Bridges editor notifications into our DocumentManager, which stays the
 * source of truth for all future intelligence phases. Last-write-wins;
 * never throws.
 */
export class DocumentSync {
  readonly manager = new DocumentManager();
  private fallbackVersion = 0;

  constructor(private readonly logger: Logger) {}

  didOpen(uri: string, text: string, version: DocumentVersion | null): void {
    try {
      this.manager.open(uri as UriString, text, this.toVersion(version));
    } catch (error) {
      this.logger.error(`didOpen failed for ${uri}: ${String(error)}`);
    }
  }

  didChange(uri: string, text: string, version: DocumentVersion | null): void {
    try {
      const next = this.manager.update(uri as UriString, text, this.toVersion(version));
      if (next === null) {
        // Change for an untracked document (e.g. missed open): open it.
        this.manager.open(uri as UriString, text, this.toVersion(version));
      }
    } catch (error) {
      this.logger.error(`didChange failed for ${uri}: ${String(error)}`);
    }
  }

  didClose(uri: string): void {
    try {
      this.manager.close(uri as UriString);
    } catch (error) {
      this.logger.error(`didClose failed for ${uri}: ${String(error)}`);
    }
  }

  /** Apply a vscode TextDocument snapshot (used by the connection layer). */
  applyTextDocument(document: Pick<TextDocument, "uri" | "version" | "getText">): void {
    this.didOpen(document.uri, document.getText(), document.version);
  }

  private toVersion(version: DocumentVersion | null | undefined): DocumentVersion {
    if (typeof version === "number" && Number.isFinite(version)) {
      if (version > this.fallbackVersion) {
        this.fallbackVersion = version;
      }
      return version;
    }
    this.fallbackVersion += 1;
    return this.fallbackVersion;
  }
}
