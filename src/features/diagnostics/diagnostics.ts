import type { Diagnostic } from "vscode-languageserver/node.js";
import { computeLineStarts, offsetAtPosition, positionAtOffset } from "../../documents/offsets.js";
import { parseTemplate } from "../../jinja/parser/parser.js";
import type { ParseError } from "../../jinja/parser/parser-errors.js";
import type { Range } from "../../types/index.js";
import { DIAGNOSTIC_RULES } from "./rules.js";

/** Minimal sender surface so publishing is unit-testable without a Connection. */
export interface DiagnosticsSender {
  sendDiagnostics(params: { uri: string; version?: number; diagnostics: Diagnostic[] }): void;
}

/** Parse text and map every error to an LSP diagnostic. Total, never throws. */
export function toDiagnostics(text: string): Diagnostic[] {
  let errors: readonly ParseError[];
  try {
    errors = parseTemplate(text).errors;
  } catch {
    return [];
  }
  const lineStarts = computeLineStarts(text);
  const seen = new Set<string>();
  const out: Diagnostic[] = [];
  for (const error of errors) {
    const key = `${error.code}:${error.start}:${error.end}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const rule = DIAGNOSTIC_RULES[error.code];
    if (rule === undefined) {
      continue;
    }
    out.push({
      range: clampRange(lineStarts, text, error.range),
      severity: rule.severity,
      code: error.code,
      source: rule.source,
      message: error.message,
    });
  }
  return out;
}

/**
 * Publish diagnostics for a document. Always sends (even when empty) so
 * editors clear stale squiggles after fixes and closes. Never throws.
 */
export function publishDiagnostics(
  sender: DiagnosticsSender,
  uri: string,
  version: number | null,
  text: string,
): void {
  try {
    const params: { uri: string; version?: number; diagnostics: Diagnostic[] } = {
      uri,
      diagnostics: toDiagnostics(text),
    };
    if (typeof version === "number" && Number.isFinite(version)) {
      params.version = version;
    }
    sender.sendDiagnostics(params);
  } catch {
    try {
      sender.sendDiagnostics({ uri, diagnostics: [] });
    } catch {
      // Publishing must never break request handling.
    }
  }
}

/** Defensive clamp: no out-of-bounds range may reach a client. */
function clampRange(lineStarts: readonly number[], text: string, range: Range): Range {
  const startOffset = offsetAtPosition(lineStarts, text, range.start);
  const endOffset = offsetAtPosition(lineStarts, text, range.end);
  const start = positionAtOffset(lineStarts, text, startOffset);
  const end = positionAtOffset(lineStarts, text, endOffset);
  if (endOffset < startOffset) {
    return { start, end: start };
  }
  return { start, end };
}
