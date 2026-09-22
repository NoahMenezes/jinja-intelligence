import { describe, expect, it } from "vitest";
import { resolveTemplate } from "../../src/templates/resolver.js";

const FROM = "file:///proj/templates/child.j2";
const ROOTS = ["file:///proj"];

function exists(paths: readonly string[]): (p: string) => boolean {
  return (p: string) => paths.includes(p);
}

describe("resolver", () => {
  it("prefers the referring file's directory", () => {
    const uri = resolveTemplate(
      { fromUri: FROM, name: "base.j2", roots: ROOTS, templateDirs: [] },
      exists(["/proj/templates/base.j2", "/proj/base.j2"]),
    );
    expect(uri).toBe("file:///proj/templates/base.j2");
  });

  it("falls back to roots, templates/ convention, and custom dirs", () => {
    expect(
      resolveTemplate({ fromUri: FROM, name: "x.j2", roots: ROOTS, templateDirs: [] }, exists(["/proj/x.j2"])),
    ).toBe("file:///proj/x.j2");
    expect(
      resolveTemplate({ fromUri: FROM, name: "y.j2", roots: ROOTS, templateDirs: [] }, exists(["/proj/templates/y.j2"])),
    ).toBe("file:///proj/templates/y.j2");
    expect(
      resolveTemplate(
        { fromUri: FROM, name: "z.j2", roots: ROOTS, templateDirs: ["/shared"] },
        exists(["/shared/z.j2"]),
      ),
    ).toBe("file:///shared/z.j2");
    expect(
      resolveTemplate(
        { fromUri: FROM, name: "w.j2", roots: ROOTS, templateDirs: ["common"] },
        exists(["/proj/common/w.j2"]),
      ),
    ).toBe("file:///proj/common/w.j2");
  });

  it("returns null for missing files and non-file referrers", () => {
    expect(
      resolveTemplate({ fromUri: FROM, name: "nope.j2", roots: ROOTS, templateDirs: [] }, exists([])),
    ).toBeNull();
    expect(
      resolveTemplate({ fromUri: FROM, name: "   ", roots: ROOTS, templateDirs: [] }, exists(["/proj/templates/"])),
    ).toBeNull();
    expect(
      resolveTemplate({ fromUri: "untitled:foo", name: "x.j2", roots: ROOTS, templateDirs: [] }, exists(["/proj/x.j2"])),
    ).toBeNull();
  });

  it("normalizes traversal without throwing", () => {
    expect(
      resolveTemplate(
        { fromUri: FROM, name: "../shared/base.j2", roots: ROOTS, templateDirs: [] },
        exists(["/proj/shared/base.j2"]),
      ),
    ).toBe("file:///proj/shared/base.j2");
    expect(() =>
      resolveTemplate({ fromUri: FROM, name: "x.j2", roots: ROOTS, templateDirs: [] }, () => {
        throw new Error("fs down");
      }),
    ).not.toThrow();
  });
});
