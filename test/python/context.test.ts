import { describe, expect, it } from "vitest";
import { PythonIndex, buildContext, contextFor, type TemplateContext } from "../../src/python/context.js";
import { extractRenderCalls } from "../../src/python/scanner.js";

function filesOf(entries: [string, string][]): Map<string, { calls: ReturnType<typeof extractRenderCalls>; text: string }> {
  const map = new Map<string, { calls: ReturnType<typeof extractRenderCalls>; text: string }>();
  for (const [uri, text] of entries) {
    map.set(uri, { calls: extractRenderCalls(text), text });
  }
  return map;
}

describe("python context", () => {
  it("merges calls across files with sources", () => {
    const context = buildContext(
      filesOf([
        ["file:///app.py", 'render_template("index.html", user=user)'],
        ["file:///routes.py", 'render_template("index.html", products=products)'],
      ]),
    );
    const entry = context.get("index.html");
    expect([...(entry?.vars ?? [])].sort()).toEqual(["products", "user"]);
    expect([...(entry?.sources ?? [])].sort()).toEqual(["file:///app.py", "file:///routes.py"]);
  });

  it("matches templates by basename and suffix", () => {
    const context = buildContext(filesOf([["file:///app.py", 'render_template("users.j2", u=u)']]));
    expect(contextFor(context, "file:///proj/templates/users.j2")?.vars).toEqual(["u"]);
    expect(contextFor(context, "file:///proj/other.j2")).toBeNull();
    // Basename matching is deliberately lenient for nested duplicates.
    expect(contextFor(context, "file:///proj/templates/admin/users.j2")?.vars).toEqual(["u"]);
  });

  it("tracks per-file calls through the index", () => {
    const index = new PythonIndex();
    expect(index.size()).toBe(0);
    index.upsert("file:///a.py", "render_template('x.html', a=a)");
    index.upsert("file:///b.py", "x = 1");
    expect(index.size()).toBe(1);
    expect(index.get("file:///a.py").length).toBe(1);
    index.upsert("file:///a.py", "x = 1");
    expect(index.size()).toBe(0);
    expect(index.remove("file:///missing.py")).toBe(false);
  });

  it("resolves kwarg types against the providing file", () => {
    const context = buildContext(
      filesOf([
        [
          "file:///app.py",
          "from dataclasses import dataclass\n@dataclass\nclass User:\n    name: str\n\ndef view():\n    return render_template('u.html', user=User(name='a'))",
        ],
      ]),
    );
    const entry: TemplateContext | undefined = context.get("u.html");
    expect(entry?.vars).toEqual(["user"]);
    expect(entry?.types["user"]).toMatchObject({ kind: "class", name: "User" });
    expect(entry?.types["user"]?.attrs).toContain("name");
  });
});
