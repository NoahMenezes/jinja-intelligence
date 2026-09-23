import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const SERVER = fileURLToPath(new URL("../../src/server.ts", import.meta.url));
const TIMEOUT_MS = 15000;

interface RpcMessage {
  readonly id?: number | string;
  readonly method?: string;
  readonly result?: unknown;
  readonly error?: unknown;
  readonly params?: unknown;
}

/** Minimal LSP client over a child process stdio. Routes responses by id. */
class TestClient {
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private readonly pending = new Map<number, (msg: RpcMessage) => void>();
  readonly notifications: RpcMessage[] = [];
  stderr = "";

  constructor(private readonly child: ChildProcessWithoutNullStreams) {
    child.stdout.on("data", (chunk: Buffer) => this.feed(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      this.stderr += chunk.toString("utf8");
    });
  }

  private feed(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const text = this.buffer.toString("utf8");
      const headerEnd = text.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return;
      }
      const header = text.slice(0, headerEnd);
      const match = /Content-Length:\s*(\d+)/i.exec(header);
      if (match === null || match[1] === undefined) {
        return;
      }
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (this.buffer.length < start + length) {
        return;
      }
      const body = this.buffer.subarray(start, start + length).toString("utf8");
      this.buffer = this.buffer.subarray(start + length);
      const message = JSON.parse(body) as RpcMessage;
      if (typeof message.id === "number" && this.pending.has(message.id)) {
        const resolve = this.pending.get(message.id);
        this.pending.delete(message.id);
        resolve?.(message);
      } else {
        this.notifications.push(message);
      }
    }
  }

  send(message: object): void {
    const body = JSON.stringify(message);
    this.child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  }

  request(method: string, params?: unknown): Promise<RpcMessage> {
    const id = this.nextId++;
    return new Promise<RpcMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const tail = this.stderr.slice(-500);
        reject(new Error(`Timed out waiting for response to ${method}. Server stderr: ${tail}`));
      }, TIMEOUT_MS);
      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  notify(method: string, params?: unknown): void {
    this.send({ jsonrpc: "2.0", method, params });
  }

  waitForExit(): Promise<number | null> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for server exit.")), TIMEOUT_MS);
      this.child.on("exit", (code) => {
        clearTimeout(timer);
        resolve(code);
      });
    });
  }

  /**
   * Wait for the next server-initiated notification with the given method.
   * The library fires change-on-open, so didOpen yields two identical
   * publishes; pass `match` to select by content (e.g. document version).
   */
  waitForNotification(method: string, match?: (msg: RpcMessage) => boolean): Promise<RpcMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timed out waiting for notification ${method}. Server stderr: ${this.stderr.slice(-500)}`));
      }, TIMEOUT_MS);
      const poll = setInterval(() => {
        const index = this.notifications.findIndex((n) => n.method === method && (match === undefined || match(n)));
        if (index !== -1) {
          const found = this.notifications.splice(index, 1)[0];
          if (found !== undefined) {
            clearTimeout(timer);
            clearInterval(poll);
            resolve(found);
          }
        }
      }, 25);
    });
  }

  /** Wait for a `window/logMessage` notification whose message matches. */
  waitForLog(pattern: RegExp): Promise<RpcMessage> {
    return this.waitForNotification(
      "window/logMessage",
      (m) => typeof (m.params as { message?: unknown }).message === "string" && pattern.test((m.params as { message: string }).message),
    );
  }
}

const children: ChildProcessWithoutNullStreams[] = [];

afterEach(() => {
  for (const child of children.splice(0)) {
    try {
      child.kill("SIGKILL");
    } catch {
      // Already exited.
    }
  }
});

function launch(): TestClient {
  // Bun is the project's runtime (see docs/development.md prerequisites);
  // the server entry is TypeScript and must be launched with it.
  const child = spawn("bun", [SERVER, "--stdio"], { stdio: ["pipe", "pipe", "pipe"] });
  children.push(child);
  return new TestClient(child);
}

function initParams(): Record<string, unknown> {
  return {
    processId: null,
    clientInfo: { name: "phase7-test" },
    rootUri: null,
    capabilities: {},
  };
}

/** The server returns a bare item array; tolerate CompletionList shape too. */
function completionLabels(result: unknown): string[] {
  if (Array.isArray(result)) {
    return (result as { label: string }[]).map((i) => i.label);
  }
  const items = (result as { items?: { label: string }[] } | null)?.items ?? [];
  return items.map((i) => i.label);
}

describe("server over stdio", () => {
  it(
    "handshakes, syncs documents, survives bad input, and exits 0 after shutdown",
    async () => {
      const client = launch();
      const init = await client.request("initialize", initParams());
      const result = init.result as { capabilities: { textDocumentSync: number }; serverInfo: { name: string } };
      expect(result.capabilities.textDocumentSync).toBe(1);
      expect(result.serverInfo.name).toBe("jinja-intelligence");

      client.notify("initialized", {});
      const uri = "file:///tmp/phase7.html";
      client.notify("textDocument/didOpen", {
        textDocument: { uri, languageId: "jinja", version: 1, text: "Hello {{ name }}" },
      });
      client.notify("textDocument/didChange", {
        textDocument: { uri, version: 2 },
        contentChanges: [{ text: "Hello {{ user }}" }],
      });
      client.notify("textDocument/didClose", { textDocument: { uri } });

      // Unknown method: server must answer with a JSON-RPC error and stay alive.
      const unknown = await client.request("foo/bar", {});
      expect(unknown.error).toBeDefined();

      const shutdown = await client.request("shutdown", undefined);
      expect(shutdown.error).toBeUndefined();
      client.notify("exit", undefined);
      await expect(client.waitForExit()).resolves.toBe(0);
    },
    TIMEOUT_MS + 5000,
  );

  it(
    "exits non-zero when killed via exit without shutdown",
    async () => {
      const client = launch();
      await client.request("initialize", initParams());
      client.notify("exit", undefined);
      await expect(client.waitForExit()).resolves.toBe(1);
    },
    TIMEOUT_MS + 5000,
  );

  it(
    "publishes syntax diagnostics on open, clears on fix and close",
    async () => {
      const client = launch();
      await client.request("initialize", initParams());
      client.notify("initialized", {});
      const uri = "file:///tmp/phase8.html";

      client.notify("textDocument/didOpen", {
        textDocument: { uri, languageId: "jinja", version: 1, text: "{% if user %}{{ user. }}" },
      });
      const opened = await client.waitForNotification("textDocument/publishDiagnostics");
      const openedParams = opened.params as { uri: string; diagnostics: { code: string; severity: number }[] };
      expect(openedParams.uri).toBe(uri);
      expect(openedParams.diagnostics.length).toBeGreaterThan(0);
      expect(openedParams.diagnostics.every((d) => d.severity === 1)).toBe(true);

      client.notify("textDocument/didChange", {
        textDocument: { uri, version: 2 },
        contentChanges: [{ text: "{% if user %}{{ user.name }}{% endif %}" }],
      });
      const fixed = await client.waitForNotification(
        "textDocument/publishDiagnostics",
        (m) => (m.params as { version?: number }).version === 2,
      );
      expect((fixed.params as { diagnostics: unknown[] }).diagnostics).toEqual([]);

      client.notify("textDocument/didClose", { textDocument: { uri } });
      const cleared = await client.waitForNotification(
        "textDocument/publishDiagnostics",
        (m) => {
          const p = m.params as { version?: number; diagnostics: unknown[] };
          return p.version === undefined && p.diagnostics.length === 0;
        },
      );
      expect((cleared.params as { diagnostics: unknown[] }).diagnostics).toEqual([]);

      const shutdown = await client.request("shutdown", undefined);
      expect(shutdown.error).toBeUndefined();
      client.notify("exit", undefined);
      await expect(client.waitForExit()).resolves.toBe(0);
    },
    TIMEOUT_MS + 5000,
  );

  it(
    "answers completion per context over stdio",
    async () => {
      const client = launch();
      const init = await client.request("initialize", initParams());
      const caps = (init.result as { capabilities: { completionProvider: { triggerCharacters: string[] } } })
        .capabilities.completionProvider;
      expect(caps.triggerCharacters).toContain("|");
      expect(caps.triggerCharacters).toContain(".");
      client.notify("initialized", {});
      const uri = "file:///tmp/phase10.j2";
      const text = "{% %}\n{{ user | }}\nplain";
      client.notify("textDocument/didOpen", {
        textDocument: { uri, languageId: "jinja", version: 1, text },
      });
      // Skip the open-time diagnostics publishes.
      await client.waitForNotification("textDocument/publishDiagnostics");

      const statements = await client.request("textDocument/completion", {
        textDocument: { uri },
        position: { line: 0, character: 2 },
      });
      const statementLabels = completionLabels(statements.result);
      expect(statementLabels).toContain("if");
      expect(statementLabels).not.toContain("endif");

      const filters = await client.request("textDocument/completion", {
        textDocument: { uri },
        position: { line: 1, character: 11 },
      });
      const filterLabels = completionLabels(filters.result);
      expect(filterLabels).toContain("upper");

      const plain = await client.request("textDocument/completion", {
        textDocument: { uri },
        position: { line: 2, character: 5 },
      });
      expect(completionLabels(plain.result)).toEqual([]);

      const shutdown = await client.request("shutdown", undefined);
      expect(shutdown.error).toBeUndefined();
      client.notify("exit", undefined);
      await expect(client.waitForExit()).resolves.toBe(0);
    },
    TIMEOUT_MS + 5000,
  );

  it(
    "answers variable and property completion over stdio",
    async () => {
      const client = launch();
      await client.request("initialize", initParams());
      client.notify("initialized", {});
      const uri = "file:///tmp/phase11.j2";
      const text = "{% for user in users %}{{ }}\n{{ loop. }}";
      client.notify("textDocument/didOpen", {
        textDocument: { uri, languageId: "jinja", version: 1, text },
      });
      await client.waitForNotification("textDocument/publishDiagnostics");

      const variables = await client.request("textDocument/completion", {
        textDocument: { uri },
        // Inside `{{ }}` on line 0.
        position: { line: 0, character: 25 },
      });
      const names = completionLabels(variables.result);
      expect(names).toContain("user");
      expect(names).toContain("users");

      const props = await client.request("textDocument/completion", {
        textDocument: { uri },
        // After `loop.` on line 1.
        position: { line: 1, character: 8 },
      });
      expect(completionLabels(props.result)).toContain("index");

      const shutdown = await client.request("shutdown", undefined);
      expect(shutdown.error).toBeUndefined();
      client.notify("exit", undefined);
      await expect(client.waitForExit()).resolves.toBe(0);
    },
    TIMEOUT_MS + 5000,
  );

  it(
    "answers hover over stdio",
    async () => {
      const client = launch();
      const init = await client.request("initialize", initParams());
      const caps = (init.result as { capabilities: { hoverProvider: boolean } }).capabilities;
      expect(caps.hoverProvider).toBe(true);
      client.notify("initialized", {});
      const uri = "file:///tmp/phase12.j2";
      const text = "{{ user.name | upper }}";
      client.notify("textDocument/didOpen", {
        textDocument: { uri, languageId: "jinja", version: 1, text },
      });
      await client.waitForNotification("textDocument/publishDiagnostics");

      const filter = await client.request("textDocument/hover", {
        textDocument: { uri },
        // Over `upper`.
        position: { line: 0, character: 17 },
      });
      const filterValue = hoverText(filter.result);
      expect(filterValue).toContain("upper(value)");

      const variable = await client.request("textDocument/hover", {
        textDocument: { uri },
        // Over `user`.
        position: { line: 0, character: 4 },
      });
      expect(hoverText(variable.result)).toContain("template context");

      const blank = await client.request("textDocument/hover", {
        textDocument: { uri },
        // Over the closing braces: no word, no hover.
        position: { line: 0, character: 22 },
      });
      expect(blank.result).toBeNull();

      const shutdown = await client.request("shutdown", undefined);
      expect(shutdown.error).toBeUndefined();
      client.notify("exit", undefined);
      await expect(client.waitForExit()).resolves.toBe(0);
    },
    TIMEOUT_MS + 5000,
  );

  it(
    "answers go-to-definition over stdio",
    async () => {
      const client = launch();
      const init = await client.request("initialize", initParams());
      const caps = (init.result as { capabilities: { definitionProvider: boolean } }).capabilities;
      expect(caps.definitionProvider).toBe(true);
      client.notify("initialized", {});

      // Real fixture files: the server reads them from disk.
      const dir = fileURLToPath(new URL("../fixtures/navigation/", import.meta.url));
      const childUri = `file://${join(dir, "child.j2")}`;
      const baseUri = `file://${join(dir, "base.j2")}`;
      const childText = readFileSync(join(dir, "child.j2"), "utf8");
      client.notify("textDocument/didOpen", {
        textDocument: { uri: childUri, languageId: "jinja", version: 1, text: childText },
      });
      await client.waitForNotification("textDocument/publishDiagnostics");

      // Over `"base.j2"` in the extends tag.
      const file = await client.request("textDocument/definition", {
        textDocument: { uri: childUri },
        position: { line: 0, character: 14 },
      });
      expect((file.result as { uri: string } | null)?.uri).toBe(baseUri);

      const uri = "file:///tmp/phase13.j2";
      client.notify("textDocument/didOpen", {
        textDocument: {
          uri,
          languageId: "jinja",
          version: 1,
          text: "{% for user in users %}{{ user }}{% endfor %}",
        },
      });
      await client.waitForNotification(
        "textDocument/publishDiagnostics",
        (m) => (m.params as { uri: string }).uri === uri,
      );
      const local = await client.request("textDocument/definition", {
        textDocument: { uri },
        // Over the `user` use.
        position: { line: 0, character: 27 },
      });
      expect((local.result as { uri: string } | null)?.uri).toBe(uri);

      const blank = await client.request("textDocument/definition", {
        textDocument: { uri },
        // Inside the tag opener: no word, no definition.
        position: { line: 0, character: 0 },
      });
      expect(blank.result).toBeNull();

      const shutdown = await client.request("shutdown", undefined);
      expect(shutdown.error).toBeUndefined();
      client.notify("exit", undefined);
      await expect(client.waitForExit()).resolves.toBe(0);
    },
    TIMEOUT_MS + 5000,
  );

  it(
    "answers references and rename over stdio",
    async () => {
      const client = launch();
      const init = await client.request("initialize", initParams());
      const caps = (init.result as { capabilities: { referencesProvider: boolean; renameProvider: boolean } })
        .capabilities;
      expect(caps.referencesProvider).toBe(true);
      expect(caps.renameProvider).toBe(true);
      client.notify("initialized", {});
      const uri = "file:///tmp/phase14.j2";
      const text = "{% for user in users %}{{ user.name }}{% endfor %}";
      client.notify("textDocument/didOpen", {
        textDocument: { uri, languageId: "jinja", version: 1, text },
      });
      await client.waitForNotification(
        "textDocument/publishDiagnostics",
        (m) => (m.params as { uri: string }).uri === uri,
      );

      const refs = await client.request("textDocument/references", {
        textDocument: { uri },
        // Over the `user` use.
        position: { line: 0, character: 27 },
        context: { includeDeclaration: false },
      });
      const locations = (refs.result as { uri: string }[] | null) ?? [];
      expect(locations.length).toBe(1);
      expect(locations[0]?.uri).toBe(uri);

      const renamed = await client.request("textDocument/rename", {
        textDocument: { uri },
        position: { line: 0, character: 27 },
        newName: "person",
      });
      const edits = (renamed.result as { changes: Record<string, { newText: string }[]> } | null)?.changes[uri] ?? [];
      expect(edits.length).toBe(2);
      expect(edits.every((e) => e.newText === "person")).toBe(true);

      const refused = await client.request("textDocument/rename", {
        textDocument: { uri },
        position: { line: 0, character: 27 },
        newName: "9x",
      });
      expect(refused.result).toBeNull();

      const shutdown = await client.request("shutdown", undefined);
      expect(shutdown.error).toBeUndefined();
      client.notify("exit", undefined);
      await expect(client.waitForExit()).resolves.toBe(0);
    },
    TIMEOUT_MS + 5000,
  );

  it(
    "answers symbols, signature help, and semantic tokens over stdio",
    async () => {
      const client = launch();
      const init = await client.request("initialize", initParams());
      const caps = (
        init.result as {
          capabilities: {
            documentSymbolProvider: boolean;
            workspaceSymbolProvider: boolean;
            signatureHelpProvider: { triggerCharacters: string[] };
            semanticTokensProvider: { legend: { tokenTypes: string[] } };
          };
        }
      ).capabilities;
      expect(caps.documentSymbolProvider).toBe(true);
      expect(caps.workspaceSymbolProvider).toBe(true);
      expect(caps.signatureHelpProvider.triggerCharacters).toContain("(");
      expect(caps.semanticTokensProvider.legend.tokenTypes).toContain("keyword");
      client.notify("initialized", {});
      const uri = "file:///tmp/phase15.j2";
      const text = '{% macro badge(text) %}{{ text }}{% endmacro %}{{ badge("a", }}';
      client.notify("textDocument/didOpen", {
        textDocument: { uri, languageId: "jinja", version: 1, text },
      });
      await client.waitForNotification(
        "textDocument/publishDiagnostics",
        (m) => (m.params as { uri: string }).uri === uri,
      );

      const symbols = await client.request("textDocument/documentSymbol", {
        textDocument: { uri },
      });
      const names = ((symbols.result as { name: string }[] | null) ?? []).map((s) => s.name);
      expect(names).toContain("badge");

      const searched = await client.request("workspace/symbol", { query: "bad" });
      const hits = ((searched.result as { name: string }[] | null) ?? []).map((s) => s.name);
      expect(hits).toContain("badge");

      const sig = await client.request("textDocument/signatureHelp", {
        textDocument: { uri },
        // Inside the call arguments, after the comma.
        position: { line: 0, character: 60 },
      });
      const label = (
        (sig.result as { signatures: { label: string }[] } | null)?.signatures[0] as { label: string } | undefined
      )?.label;
      expect(label).toContain("badge(");

      const tokens = await client.request("textDocument/semanticTokens/full", {
        textDocument: { uri },
      });
      const data = (tokens.result as { data: number[] } | null)?.data ?? [];
      expect(data.length).toBeGreaterThan(0);
      expect(data.length % 5).toBe(0);

      const shutdown = await client.request("shutdown", undefined);
      expect(shutdown.error).toBeUndefined();
      client.notify("exit", undefined);
      await expect(client.waitForExit()).resolves.toBe(0);
    },
    TIMEOUT_MS + 5000,
  );

  it(
    "indexes a workspace and completes template names across files",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "jinja-proj-"));
      try {
        writeFileSync(join(dir, "base.j2"), "<html>{% block b %}x{% endblock %}</html>");
        writeFileSync(join(dir, "macros.j2"), "{% macro btn() %}x{% endmacro %}");
        const client = launch();
        await client.request("initialize", {
          ...initParams(),
          rootUri: `file://${dir}`,
        });
        client.notify("initialized", {});
        // Wait for the background scan to land in the index.
        await client.waitForLog(/Project indexed: \d+ templates/);

        const childUri = `file://${dir}/child.j2`;
        client.notify("textDocument/didOpen", {
          textDocument: { uri: childUri, languageId: "jinja", version: 1, text: '{% extends "" %}' },
        });
        await client.waitForNotification(
          "textDocument/publishDiagnostics",
          (m) => (m.params as { uri: string }).uri === childUri,
        );

        // Inside the extends string: index basenames offered.
        const completed = await client.request("textDocument/completion", {
          textDocument: { uri: childUri },
          position: { line: 0, character: 12 },
        });
        const names = completionLabels(completed.result);
        expect(names).toContain("base.j2");

        // Workspace symbols reach macros in unopened files.
        const searched = await client.request("workspace/symbol", { query: "btn" });
        const hits = ((searched.result as { name: string; location: { uri: string } }[] | null) ?? []).map(
          (s) => s.name,
        );
        expect(hits).toContain("btn");
        const btn = ((searched.result as { name: string; location: { uri: string } }[] | null) ?? []).find(
          (s) => s.name === "btn",
        );
        expect(btn?.location.uri).toBe(`file://${dir}/macros.j2`);

        const shutdown = await client.request("shutdown", undefined);
        expect(shutdown.error).toBeUndefined();
        client.notify("exit", undefined);
        await expect(client.waitForExit()).resolves.toBe(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    TIMEOUT_MS + 5000,
  );

  it(
    "falls back to the open file's directory without a workspace",
    async () => {
      const dir = mkdtempSync(join(tmpdir(), "jinja-lone-"));
      try {
        writeFileSync(join(dir, "sibling.j2"), "x");
        const client = launch();
        // No rootUri: the server must index the file's own directory.
        await client.request("initialize", initParams());
        client.notify("initialized", {});

        const uri = `file://${dir}/lone.j2`;
        client.notify("textDocument/didOpen", {
          textDocument: { uri, languageId: "jinja", version: 1, text: '{% extends "" %}' },
        });
        await client.waitForLog(/indexing .* as fallback/);
        await client.waitForNotification(
          "textDocument/publishDiagnostics",
          (m) => (m.params as { uri: string }).uri === uri,
        );

        const completed = await client.request("textDocument/completion", {
          textDocument: { uri },
          position: { line: 0, character: 12 },
        });
        expect(completionLabels(completed.result)).toContain("sibling.j2");

        const shutdown = await client.request("shutdown", undefined);
        expect(shutdown.error).toBeUndefined();
        client.notify("exit", undefined);
        await expect(client.waitForExit()).resolves.toBe(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    },
    TIMEOUT_MS + 5000,
  );
});

/** Extract Markdown hover text, tolerating a null result. */
function hoverText(result: unknown): string {
  if (result === null || result === undefined) {
    return "";
  }
  const contents = (result as { contents: unknown }).contents;
  if (typeof contents === "string") {
    return contents;
  }
  if (typeof contents === "object" && contents !== null && "value" in contents) {
    return String((contents as { value: unknown }).value);
  }
  return "";
}
