import type { InitializeResult } from "vscode-languageserver/node.js";
import { createServerCapabilities } from "./capabilities.js";

/** Tracks the LSP shutdown handshake for correct exit codes. */
export class Lifecycle {
  private shutdownReceived = false;

  markShutdown(): void {
    this.shutdownReceived = true;
  }

  /** Exit code for the `exit` notification: 0 after shutdown, else 1. */
  exitCode(): number {
    return this.shutdownReceived ? 0 : 1;
  }
}

/** Pure builder for the `initialize` response. */
export function createInitializeResult(name: string, version: string): InitializeResult {
  return {
    capabilities: createServerCapabilities(),
    serverInfo: { name, version },
  };
}
