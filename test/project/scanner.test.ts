import { describe, expect, it } from "vitest";
import { MAX_INDEX_FILES, walkRoots, type ScanFs } from "../../src/project/scanner.js";

type Node = { [name: string]: Node | string | null };

function fakeFs(tree: Node): ScanFs {
  const get = (path: string): Node | string | null | undefined => {
    const parts = path.split("/").filter((p) => p.length > 0);
    let node: Node | string | null | undefined = tree;
    for (const part of parts) {
      if (typeof node !== "object" || node === null) {
        return undefined;
      }
      node = (node as Node)[part];
    }
    return node;
  };
  return {
    readdir: async (path: string) => {
      const node = get(path);
      if (typeof node !== "object" || node === null) {
        throw new Error(`not a dir: ${path}`);
      }
      return Object.keys(node);
    },
    stat: async (path: string) => {
      const node = get(path);
      if (node === undefined) {
        throw new Error(`missing: ${path}`);
      }
      return {
        isDirectory: () => typeof node === "object" && node !== null,
        isFile: () => typeof node === "string",
      };
    },
  };
}

const OPTS = { extensions: [".j2", ".jinja"], pythonExtensions: [".py"], skipDirs: ["node_modules", ".git"], maxFiles: 100 };

describe("scanner", () => {
  it("collects nested templates and skips decoys", async () => {
    const fs = fakeFs({
      proj: {
        "app.py": "x",
        templates: { "base.j2": "b", nested: { "child.j2": "c" } },
        static: { "a.css": "x" },
        node_modules: { "evil.j2": "x" },
        ".git": { "hook.j2": "x" },
      },
    });
    const result = await walkRoots(["/proj"], OPTS, fs);
    expect([...result.files].sort()).toEqual(["/proj/templates/base.j2", "/proj/templates/nested/child.j2"]);
    expect(result.capped).toBe(false);
  });

  it("includes html candidates and enforces the cap", async () => {
    const fs = fakeFs({ proj: { "a.html": "x", "b.j2": "y" } });
    const result = await walkRoots(["/proj"], OPTS, fs);
    expect([...result.files].sort()).toEqual(["/proj/a.html", "/proj/b.j2"]);
    const capped = await walkRoots(["/proj"], { ...OPTS, maxFiles: 1 }, fs);
    expect(capped.files.length).toBe(1);
    expect(capped.capped).toBe(true);
  });

  it("tolerates unreadable directories", async () => {
    const fs = fakeFs({ proj: { "ok.j2": "x" } });
    const result = await walkRoots(["/proj", "/missing"], OPTS, fs);
    expect(result.files).toEqual(["/proj/ok.j2"]);
    expect(result.skipped).toContain("/missing");
  });

  it("terminates on symlink cycles via canonical paths", async () => {
    const fs = fakeFs({ proj: { "a.j2": "x" } });
    const cycling: ScanFs = {
      ...fs,
      realpath: async (path: string) => (path === "/proj/loop" ? "/proj" : path),
      stat: async (path: string) => {
        if (path === "/proj/loop") {
          return { isDirectory: () => true, isFile: () => false };
        }
        return fs.stat(path);
      },
      readdir: async (path: string) => {
        if (path === "/proj/loop") {
          return ["a.j2", "loop"];
        }
        return fs.readdir(path);
      },
    };
    const result = await walkRoots(["/proj"], OPTS, cycling);
    expect(result.files).toEqual(["/proj/a.j2"]);
  });
});
