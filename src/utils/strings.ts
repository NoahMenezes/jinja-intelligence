/** Split on \n, \r\n, or \r. Preserves no line breaks. */
export function splitLines(text: string): string[] {
  return text.split(/\r\n|\n|\r/);
}

/** Number of lines (empty string counts as 1 line, matching text-document convention). */
export function lineCount(text: string): number {
  return splitLines(text).length;
}

/** True for empty or whitespace-only lines. */
export function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

/** Length in UTF-16 code units (JS string length semantics, LSP-compatible). */
export function utf16Length(text: string): number {
  return text.length;
}
