import { describe, expect, it } from "vitest";
import { extractDjangoCalls, extractRenderCalls, extractTemplateCalls } from "../../src/python/scanner.js";

describe("python scanner", () => {
  it("extracts basic and multiline calls", () => {
    const single = extractRenderCalls('return render_template("index.html", user=user)');
    expect(single.length).toBe(1);
    expect(single[0]?.template).toBe("index.html");
    expect(single[0]?.kwargs.map((k) => k.name)).toEqual(["user"]);

    const multi = extractRenderCalls(
      'return render_template(\n    "users.j2",\n    users=users,\n    title="Hi",\n)',
    );
    expect(multi.length).toBe(1);
    expect(multi[0]?.template).toBe("users.j2");
    expect(multi[0]?.kwargs.map((k) => k.name)).toEqual(["users", "title"]);
  });

  it("handles methods, nesting, and string args", () => {
    const method = extractRenderCalls("return self.render_template('a.html', x=1)");
    expect(method[0]?.template).toBe("a.html");
    const nested = extractRenderCalls('render_template("b.html", items=get_items(1, [2]), x={"k": f(3)})');
    expect(nested[0]?.kwargs.map((k) => k.name)).toEqual(["items", "x"]);
  });

  it("skips spreads, non-literals, comments, and lookalikes", () => {
    expect(extractRenderCalls("render_template(**ctx)")[0]?.kwargs).toEqual([]);
    expect(extractRenderCalls("render_template(name)").map((c) => c.template)).toEqual([null]);
    expect(extractRenderCalls("# render_template('x')\nx = 1")).toEqual([]);
    expect(extractRenderCalls('s = "render_template(\'x\')"')).toEqual([]);
    expect(extractRenderCalls("my_render_template_x('y')")).toEqual([]);
    expect(extractRenderCalls("render_templatex('y')")).toEqual([]);
  });

  it("never throws on hostile input", () => {
    for (const text of ["render_template(", 'render_template("a",', "render_template", '"""render_template("x")"""', ""]) {
      expect(() => extractRenderCalls(text)).not.toThrow();
      expect(Array.isArray(extractRenderCalls(text))).toBe(true);
    }
  });
});

describe("django scanner", () => {
  it("extracts render() dict contexts", () => {
    const calls = extractDjangoCalls('return render(request, "page.html", {"title": t, "n": 1})');
    expect(calls.length).toBe(1);
    expect(calls[0]?.template).toBe("page.html");
    expect(calls[0]?.kwargs.map((k) => k.name).sort()).toEqual(["n", "title"]);
  });

  it("handles bare contexts, missing dicts, and render_to_response", () => {
    const bare = extractDjangoCalls('return render(request, "a.html", ctx)');
    expect(bare[0]?.template).toBe("a.html");
    expect(bare[0]?.kwargs).toEqual([]);
    const minimal = extractDjangoCalls('return render(request, "b.html")');
    expect(minimal[0]?.template).toBe("b.html");
    const rtr = extractDjangoCalls('return render_to_response("c.html", {"x": 1})');
    expect(rtr[0]?.template).toBe("c.html");
    expect(rtr[0]?.kwargs.map((k) => k.name)).toEqual(["x"]);
  });

  it("skips non-dict keys and non-calls", () => {
    expect(extractDjangoCalls('render(request, "t.html", {key: 1})')[0]?.kwargs).toEqual([]);
    expect(extractDjangoCalls("renderer(request, 'x')")).toEqual([]);
    expect(extractDjangoCalls("# render(request, 'x')")).toEqual([]);
  });

  it("merges flask and django calls in source order", () => {
    const text = 'render(request, "a.html", {"x": 1})\nrender_template("b.html", y=2)';
    expect(extractTemplateCalls(text).map((c) => c.template)).toEqual(["a.html", "b.html"]);
  });
});
