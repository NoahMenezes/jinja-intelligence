import * as nodeFs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Project, type ProjectFs } from "../../src/project/project.js";

const FIXTURES = fileURLToPath(new URL("../fixtures/project/app", import.meta.url));

const NODE_FS: ProjectFs = {
  readdir: (path: string) => nodeFs.promises.readdir(path),
  stat: (path: string) => nodeFs.promises.stat(path),
  readFile: async (path: string) => {
    try {
      return await nodeFs.promises.readFile(path, "utf8");
    } catch {
      return null;
    }
  },
  statFile: async (path: string) => {
    try {
      const st = await nodeFs.promises.stat(path);
      return { mtimeMs: st.mtimeMs };
    } catch {
      return null;
    }
  },
};

function project(): Project {
  return new Project({ roots: [`file://${FIXTURES}`], extensions: [".j2", ".jinja"], templateDirs: [] }, NODE_FS);
}

describe("project", () => {
  it("scans the tree, gating html by markers and skipping decoys", async () => {
    const app = project();
    const stats = await app.scan();
    expect(app.isScanned()).toBe(true);
    expect(stats.capped).toBe(false);
    const uris = app.index.uris();
    expect(uris.some((u) => u.endsWith("/base.html"))).toBe(true);
    expect(uris.some((u) => u.endsWith("/users.j2"))).toBe(true);
    expect(uris.some((u) => u.endsWith("/macros.j2"))).toBe(true);
    expect(uris.some((u) => u.includes("node_modules"))).toBe(false);
    expect(uris.some((u) => u.endsWith(".css") || u.endsWith(".py"))).toBe(false);
    expect(app.index.macros("button").length).toBe(1);
  });

  it("shadows disk with open documents and reverts on close", async () => {
    const app = project();
    await app.scan();
    const uri = `file://${FIXTURES}/templates/users.j2`;
    app.upsert(uri, "{% macro edited() %}x{% endmacro %}");
    expect(app.index.macros("edited").length).toBe(1);
    await app.revertToDisk(uri);
    expect(app.index.macros("edited")).toEqual([]);
    expect(app.index.macros("button").length).toBe(1);
  });

  it("drops deleted files on refresh", async () => {
    const app = project();
    await app.scan();
    const ghost = "file:///tmp/fake-proj/ghost.j2";
    app.upsert(ghost, "{% macro m() %}x{% endmacro %}");
    expect(app.index.get(ghost)).not.toBeNull();
    // Nothing exists at that path on disk: refresh drops it.
    await app.refreshPath("/tmp/fake-proj/ghost.j2");
    expect(app.index.get(ghost)).toBeNull();
  });

  it("routes python files to the python index, not templates", async () => {
    const app = project();
    await app.scan();
    expect(app.python.size()).toBe(1);
    const uri = `file://${FIXTURES}/app.py`;
    // Open-document shadowing with richer content.
    app.upsert(uri, 'render_template("users.j2", user=user)\nrender_template("x.html")');
    expect(app.index.get(uri)).toBeNull();
    const context = app.templateContext(`file://${FIXTURES}/templates/users.j2`);
    expect(context?.vars).toEqual(["user"]);
    expect(context?.sources).toEqual([uri]);
    await app.revertToDisk(uri);
    expect(app.templateContext(`file://${FIXTURES}/templates/users.j2`)?.vars).toEqual([]);
  });

  it("prunes files deleted without watcher events", async () => {
    const app = project();
    await app.scan();
    const ghost = "file:///tmp/fake-proj/gone.j2";
    app.upsert(ghost, "x");
    expect(app.index.get(ghost)).not.toBeNull();
    expect(await app.prune()).toBe(1);
    expect(app.index.get(ghost)).toBeNull();
    // Second prune is a clean no-op.
    expect(await app.prune()).toBe(0);
  });

  it("indexes a django-shaped project with dict contexts", async () => {
    const root = fileURLToPath(new URL("../fixtures/project/django", import.meta.url));
    const django = new Project({ roots: [`file://${root}`], extensions: [".j2", ".jinja"], templateDirs: [] }, NODE_FS);
    const stats = await django.scan();
    expect(stats.capped).toBe(false);
    const context = django.templateContext(`file://${root}/templates/profile.html`);
    expect(context?.vars).toEqual(["user"]);
    expect(context?.sources).toEqual([`file://${root}/views.py`]);
  });
});
