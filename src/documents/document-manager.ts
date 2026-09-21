import type { DocumentVersion, UriString } from "../types/index.js";
import { Document } from "./document.js";

/**
 * URI-keyed store of immutable Documents.
 * Keys are exact editor URI strings. Last-write-wins; never throws.
 */
export class DocumentManager {
  private readonly store = new Map<string, Document>();

  open(uri: UriString, text: string, version: DocumentVersion): Document {
    const doc = Document.create(uri, text, version);
    this.store.set(uri, doc);
    return doc;
  }

  update(uri: UriString, text: string, version: DocumentVersion): Document | null {
    const existing = this.store.get(uri);
    if (existing === undefined) {
      return null;
    }
    const next = existing.update(text, version);
    this.store.set(uri, next);
    return next;
  }

  close(uri: UriString): boolean {
    return this.store.delete(uri);
  }

  get(uri: UriString): Document | null {
    return this.store.get(uri) ?? null;
  }

  has(uri: UriString): boolean {
    return this.store.has(uri);
  }

  size(): number {
    return this.store.size;
  }

  uris(): readonly UriString[] {
    return [...this.store.keys()] as UriString[];
  }

  clear(): void {
    this.store.clear();
  }
}
