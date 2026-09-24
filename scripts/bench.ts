/**
 * Performance bench: measures what Phase 19 is allowed to optimize.
 * Run with `bun scripts/bench.ts`. Prints a Markdown table; results are
 * recorded in docs/performance.md. No assertions — numbers inform, CI stays
 * deterministic. Budgets: startup < 500ms, keystroke features < 16ms.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

interface Row {
  readonly name: string;
  readonly ms: number;
  readonly note: string;
}

const rows: Row[] = [];

function measure(name: string, note: string, fn: () => void): void {
  // Warmup, then best of 5.
  fn();
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    fn();
    best = Math.min(best, performance.now() - start);
  }
  rows.push({ name, ms: best, note });
}

async function measureAsync(name: string, note: string, fn: () => Promise<void>): Promise<void> {
  await fn();
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 3; i++) {
    const start = performance.now();
    await fn();
    best = Math.min(best, performance.now() - start);
  }
  rows.push({ name, ms: best, note });
}

/** Deterministic large template: mixed constructs, ~2000 lines. */
function largeTemplate(): string {
  const parts: string[] = ['{% extends "base.j2" %}', "{% import \"m.j2\" as m %}"];
  for (let i = 0; i < 120; i++) {
    parts.push(`{% set var${i} = items | join(", ") %}`);
    parts.push(`{% for user in users %}{{ user.name | upper }} {{ loop.index }}{% endfor %}`);
    parts.push(`{% if var${i} is defined %}{{ var${i} | default("x", true) }}{% else %}none{% endif %}`);
    parts.push(`{% macro card${i}(title, level="info") %}{{ title }} {{ level }}{% endmacro %}`);
    parts.push(`{{ m.button(var${i}) }} {# comment ${i} #}`);
    parts.push(`<p>plain html ${i}</p>`);
    parts.push(`{% filter upper %}text ${i}{% endfilter %}`);
    parts.push(`{% with a=${i} %}{{ a }}{% endwith %}`);
    parts.push(`{% set block${i} %}body ${i}{% endset %}`);
    parts.push(`{% call dump(var${i}) %}x{% endcall %}`);
    parts.push(`{% do log(${i}) %}`);
    parts.push(`{{ {"k": var${i}, "n": ${i}} }}`);
    parts.push(`{{ (var${i} + 1) * 2 if var${i} is number else 0 }}`);
    parts.push(`{% raw %}{{ not_a_tag }}{% endraw %}`);
    parts.push(`{% from "m.j2" import btn${i} %}`);
    parts.push(`{% include "part.j2" %}`);
  }
  return parts.join("\n") + "\n";
}

async function coldStartupMs(): Promise<number> {
  const start = performance.now();
  await new Promise<void>((resolve, reject) => {
    const child = spawn("bun", [join(ROOT, "src", "server.ts"), "--stdio"], { stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => reject(new Error("startup timeout")), 15000);
    child.stdout.once("data", () => {
      clearTimeout(timer);
      child.kill("SIGKILL");
      resolve();
    });
    child.stderr.on("data", () => undefined);
    const body = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { processId: null, rootUri: null, capabilities: {} },
    });
    child.stdin.write(`Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
  });
  return performance.now() - start;
}

async function main(): Promise<void> {
  const lex = await import("../src/jinja/lexer/lexer.js");
  const parser = await import("../src/jinja/parser/parser.js");
  const analysis = await import("../src/jinja/analysis/analyzer.js");
  const diagnostics = await import("../src/features/diagnostics/diagnostics.js");
  const completion = await import("../src/features/completion/completion.js");
  const hover = await import("../src/features/hover/hover.js");
  const references = await import("../src/features/references/references.js");
  const semantic = await import("../src/features/semantic-tokens/semantic-tokens.js");
  const projectMod = await import("../src/project/project.js");

  const big = largeTemplate();
  console.error(`fixture: ${big.split("\n").length} lines, ${big.length} chars`);

  measure("lex (large)", "tokenize 2000-line template", () => {
    lex.lex(big);
  });
  const parsed = parser.parseTemplate(big).root;
  measure("parse (large)", "full template to AST", () => {
    parser.parseTemplate(big);
  });
  measure("analyze (large)", "scopes + symbols", () => {
    analysis.analyzeTemplate(parsed);
  });
  measure("diagnostics (large)", "parse to LSP diagnostics", () => {
    diagnostics.toDiagnostics(big);
  });
  const varOffset = big.indexOf("{{ var0") + 3;
  measure("completion (large)", "variable slot incl. parse+analyze", () => {
    completion.complete(big, varOffset);
  });
  measure("hover (large)", "symbol hover incl. parse+analyze", () => {
    hover.hover(big, varOffset);
  });
  measure("references (large)", "single-file search", () => {
    references.references(big, "file:///big.j2", varOffset, false);
  });
  measure("semanticTokens (large)", "full delta-encoded tokens", () => {
    semantic.semanticTokens(big);
  });

  // Project scale: 300 generated templates + python files.
  const dir = mkdtempSync(join(tmpdir(), "jinja-bench-"));
  try {
    for (let i = 0; i < 280; i++) {
      writeFileSync(join(dir, `page${i}.j2`), `{% extends "base.j2" %}{% block c %}{{ item${i} }}{% endmacro %}`);
    }
    for (let i = 0; i < 20; i++) {
      writeFileSync(join(dir, `app${i}.py`), `def v${i}():\n    return render_template("page${i}.j2", item${i}=x)\n`);
    }
    const project = new projectMod.Project(
      { roots: [`file://${dir}`], extensions: [".j2"], templateDirs: [] },
      {
        readdir: (p: string) => import("node:fs").then((fs) => fs.promises.readdir(p)),
        stat: (p: string) => import("node:fs").then((fs) => fs.promises.stat(p)),
        readFile: async (p: string) => import("node:fs").then((fs) => fs.promises.readFile(p, "utf8").catch(() => null)),
        statFile: async () => null,
      },
    );
    await measureAsync("project scan (300 files)", "walk + parse + index", () => project.scan().then(() => undefined));
    const memAfter = process.memoryUsage().heapUsed;
    rows.push({
      name: "index memory (300 files)",
      ms: 0,
      // Absolute heap (GC makes deltas noisy); order of magnitude is the signal.
      note: `${(memAfter / 1024 / 1024).toFixed(1)} MiB heap after scan`,
    });
    const uri = `file://${dir}/page0.j2`;
    measure("templateContext", "merged map build", () => {
      project.templateContext(uri);
    });
    measure("basenames", "sorted name list", () => {
      project.index.basenames();
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  rows.push({ name: "cold startup", ms: await coldStartupMs(), note: "spawn to first response" });

  console.log("| operation | best of N | note |");
  console.log("| --- | --- | --- |");
  for (const row of rows) {
    const value = row.name.startsWith("index memory") ? row.note : `${row.ms.toFixed(row.ms < 1 ? 2 : 1)} ms`;
    console.log(`| ${row.name} | ${value} | ${row.note} |`);
  }
}

await main();
