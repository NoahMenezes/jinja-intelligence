/**
 * Minimal logger. Writes to the LSP connection console when available and
 * always mirrors errors to stderr. NEVER writes to stdout: stdout is the
 * LSP protocol stream and a single stray print kills every client.
 */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

interface ConsoleLike {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function createLogger(connection?: { console?: ConsoleLike }): Logger {
  const remote = connection?.console;
  return {
    info(message: string): void {
      try {
        remote?.info(message);
      } catch {
        // Logging must never break request handling.
      }
    },
    warn(message: string): void {
      try {
        remote?.warn(message);
      } catch {
        // ignore
      }
    },
    error(message: string): void {
      try {
        remote?.error(message);
      } catch {
        // ignore
      }
      try {
        process.stderr.write(`[jinja-intelligence] ${message}\n`);
      } catch {
        // ignore
      }
    },
  };
}
