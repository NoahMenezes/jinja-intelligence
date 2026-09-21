import type { DocumentVersion, Position, Range, UriString } from "../types/index.js";
import { createRange } from "../utils/ranges.js";
import { splitLines } from "../utils/strings.js";
import { computeLineStarts, offsetAtPosition, positionAtOffset } from "./offsets.js";

/**
 * Immutable text document. Updates return a new instance.
 * No LSP or Jinja imports — pure document logic only.
 */
export class Document {
  private readonly lineStarts: readonly number[];

  private constructor(
    readonly uri: UriString,
    readonly version: DocumentVersion,
    readonly text: string,
    lineStarts: readonly number[],
  ) {
    this.lineStarts = lineStarts;
  }

  static create(uri: UriString, text: string, version: DocumentVersion): Document {
    return new Document(uri, version, text, computeLineStarts(text));
  }

  lineCount(): number {
    return splitLines(this.text).length;
  }

  /** Line content without breaks, or null when out of bounds. */
  lineAt(line: number): string | null {
    const lines = splitLines(this.text);
    const value = lines[line];
    return value === undefined ? null : value;
  }

  offsetAt(pos: Position): number {
    return offsetAtPosition(this.lineStarts, this.text, pos);
  }

  positionAt(offset: number): Position {
    return positionAtOffset(this.lineStarts, this.text, offset);
  }

  getTextInRange(range: Range): string {
    const normalized = createRange(range.start, range.end);
    const start = this.offsetAt(normalized.start);
    const end = this.offsetAt(normalized.end);
    return this.text.slice(start, end);
  }

  update(text: string, version: DocumentVersion): Document {
    return new Document(this.uri, version, text, computeLineStarts(text));
  }
}
