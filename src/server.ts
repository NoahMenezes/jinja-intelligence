#!/usr/bin/env node
import { SERVER_NAME, SERVER_VERSION } from "./index.js";
import { createServer } from "./lsp/connection.js";

/**
 * jinja-intelligence language server entry point.
 * stdio transport only. The ONLY modes that touch stdout are --version/--help;
 * the protocol owns stdout in every other mode.
 */

function printUsage(): void {
  process.stdout.write(`Usage: ${SERVER_NAME} [--stdio] [--version] [--help]\n`);
}

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  printUsage();
  process.exit(0);
}
if (args.includes("--version") || args.includes("-v")) {
  process.stdout.write(`${SERVER_NAME} ${SERVER_VERSION}\n`);
  process.exit(0);
}

process.on("uncaughtException", (error): void => {
  try {
    process.stderr.write(`[${SERVER_NAME}] uncaughtException: ${String(error)}\n`);
  } catch {
    // Last resort: never let logging itself crash the process handler.
  }
});

process.on("unhandledRejection", (reason): void => {
  try {
    process.stderr.write(`[${SERVER_NAME}] unhandledRejection: ${String(reason)}\n`);
  } catch {
    // ignore
  }
});

process.on("SIGTERM", (): void => {
  process.exit(0);
});

const server = createServer();

server.connection.onExit((): void => {
  process.exit(server.lifecycle.exitCode());
});

server.start();
