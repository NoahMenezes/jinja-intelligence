import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectSync } from "../../src/lsp/project-sync.js";
import type { ProjectFs } from "../../src/project/project.js";
import type { Logger } from "../../src/utils/logging.js";

const silent: Logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

function fakeFs(files: Record<string, string>): ProjectFs & { reads: number } {
  const state = { reads: 0 };
  const fs: ProjectFs & { reads: number } = {
    reads: 0,
    readdir: async (path: string) => {
      const prefix = path.endsWith("/") ? path : `${path}/`;
      const entries = new Set<string>();
      for (const file of Object.keys(files)) {
        if (file.startsWith(prefix)) {
          const rest = file.slice(prefix.length);
          const slash = rest.indexOf("/");
          entries.add(slash === -1 ? rest : rest.slice(0, slash));
        }
      }
      return [...entries];
    },
    stat: async (path: string) => {
      if (Object.hasOwn(files, path)) {
        return { isDirectory: () => false, isFile: () => true };
      }
      const prefix = path.endsWith("/") ? path : `${path}/`;
      const isDir = Object.keys(files).some((f) => f.startsWith(prefix));
      if (!isDir) {
        throw new Error(`missing: ${path}`);
      }
      return { isDirectory: () => true, isFile: () => false };
    },
    readFile: async (path: string) => {
      state.reads++;
      fs.reads = state.reads;
      return files[path] ?? null;
    },
    statFile: async (path: string) => (Object.hasOwn(files, path) ? { mtimeMs: 1 } : null),
  };
  return fs;
}

describe("project-sync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("falls back to the open file's directory exactly once", async () => {
    const fs = fakeFs({ "/proj/a.j2": "x", "/proj/b.py": "y = 1" });
    const sync = new ProjectSync(silent, () => new Map(), fs);
    sync.configure([], [], [".j2"]);
    sync.opened("file:///proj/new.j2", "{{ x }}");
    expect(sync.getRoots()).toEqual(["file:///proj"]);
    // Let the background scan settle.
    await vi.runAllTimersAsync();
    await Promise.resolve();
    expect(sync.getProject()?.index.size()).toBeGreaterThanOrEqual(1);
    // Second open elsewhere does not re-trigger the fallback.
    sync.opened("file:///other/z.j2", "{{ y }}");
    expect(sync.getRoots()).toEqual(["file:///proj"]);
  });

  it("debounces watched bursts into one refresh", async () => {
    const fs = fakeFs({ "/proj/a.j2": "x" });
    const sync = new ProjectSync(silent, () => new Map(), fs);
    sync.configure(["file:///proj"], [], [".j2"]);
    await sync.getProject()?.scan();
    sync.watched("file:///proj/a.j2", false);
    sync.watched("file:///proj/a.j2", false);
    sync.watched("file:///proj/b.j2", true);
    expect(sync.getProject()?.index.get("file:///proj/b.j2")).toBeNull();
    await vi.runAllTimersAsync();
    expect(sync.getProject()?.index.size()).toBe(1);
  });

  it("never throws on hostile input", () => {
    const fs = fakeFs({});
    const sync = new ProjectSync(silent, () => {
      throw new Error("docs down");
    }, fs);
    expect(() => sync.configure([], [], [])).not.toThrow();
    expect(() => sync.opened("", "")).not.toThrow();
    expect(() => sync.changed("", "")).not.toThrow();
    expect(() => sync.closed("")).not.toThrow();
    expect(() => sync.watched("", false)).not.toThrow();
    expect(sync.getProject()).not.toBeNull();
  });
});
