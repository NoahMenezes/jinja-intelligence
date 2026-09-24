import * as path from "node:path";
import * as vscode from "vscode";
import {
  LanguageClient,
  TransportKind,
  type LanguageClientOptions,
  type ServerOptions,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

const CONFIG_SECTION = "jinjaIntelligence";

/** Resolve the language server bundled with the extension (see copy-server). */
export function resolveServerModule(context: vscode.ExtensionContext): string {
  return context.asAbsolutePath(path.join("dist", "server.js"));
}

export function activate(context: vscode.ExtensionContext): void {
  const serverModule = resolveServerModule(context);
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.stdio, args: ["--stdio"] },
    debug: { module: serverModule, transport: TransportKind.stdio, args: ["--stdio"] },
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: "jinja" }, { scheme: "file", language: "jinja2" }],
    initializationOptions: readSettings(),
    synchronize: {
      configurationSection: CONFIG_SECTION,
      fileEvents: vscode.workspace.createFileSystemWatcher("**/*.{j2,jinja,jinja2,html}"),
    },
  };
  client = new LanguageClient("jinja-intelligence", "Jinja Intelligence", serverOptions, clientOptions);
  context.subscriptions.push(
    client,
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(CONFIG_SECTION)) {
        void client?.sendNotification("workspace/didChangeConfiguration", {
          settings: { [CONFIG_SECTION]: readSettings() },
        });
      }
    }),
  );
  client.start().catch((error: unknown) => {
    void vscode.window.showErrorMessage(`Jinja Intelligence failed to start: ${String(error)}`);
  });
}

function readSettings(): Record<string, unknown> {
  const config = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    templateDirectories: config.get<readonly string[]>("templateDirectories", []),
    templateExtensions: config.get<readonly string[]>("templateExtensions", [".jinja", ".jinja2", ".j2"]),
    maxLogLines: config.get<number>("maxLogLines", 500),
  };
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
}
