import { DiagnosticSeverity } from "vscode-languageserver/node.js";
import type { ParseErrorCode } from "../../jinja/parser/parser-errors.js";

/** Stable diagnostic source identifying this server in editors. */
export const DIAGNOSTIC_SOURCE = "jinja-intelligence";

export interface DiagnosticRule {
  readonly severity: DiagnosticSeverity;
  readonly source: typeof DIAGNOSTIC_SOURCE;
}

/**
 * Phase 8: every syntax error surfaces as an Error. Each code reflects a
 * genuine break in the template, including typing-transient states.
 * Downgrading hints is a later tuning task, not a correctness one.
 */
export const DIAGNOSTIC_RULES: Record<ParseErrorCode, DiagnosticRule> = {
  "unterminated-variable": { severity: DiagnosticSeverity.Error, source: DIAGNOSTIC_SOURCE },
  "unterminated-block": { severity: DiagnosticSeverity.Error, source: DIAGNOSTIC_SOURCE },
  "unterminated-comment": { severity: DiagnosticSeverity.Error, source: DIAGNOSTIC_SOURCE },
  "unterminated-string": { severity: DiagnosticSeverity.Error, source: DIAGNOSTIC_SOURCE },
  "unterminated-expression": { severity: DiagnosticSeverity.Error, source: DIAGNOSTIC_SOURCE },
  "expected-expression": { severity: DiagnosticSeverity.Error, source: DIAGNOSTIC_SOURCE },
  "expected-property": { severity: DiagnosticSeverity.Error, source: DIAGNOSTIC_SOURCE },
  "expected-close": { severity: DiagnosticSeverity.Error, source: DIAGNOSTIC_SOURCE },
  "missing-end-tag": { severity: DiagnosticSeverity.Error, source: DIAGNOSTIC_SOURCE },
  "mismatched-end-tag": { severity: DiagnosticSeverity.Error, source: DIAGNOSTIC_SOURCE },
  "expected-statement": { severity: DiagnosticSeverity.Error, source: DIAGNOSTIC_SOURCE },
  "expected-block-name": { severity: DiagnosticSeverity.Error, source: DIAGNOSTIC_SOURCE },
};
