import { describe, expect, it } from "vitest";
import { extensionOf, isChildOf, joinPath, toFileUri, toFsPath } from "../../src/utils/paths.js";

describe("paths", () => {
  it("round-trips file URIs", () => {
    const uri = toFileUri("/tmp/templates/base.html");
    expect(uri).not.toBeNull();
    if (uri === null) {
      return;
    }
    expect(uri.startsWith("file://")).toBe(true);
    expect(toFsPath(uri)).toBe("/tmp/templates/base.html");
  });

  it("returns null for invalid input", () => {
    expect(toFileUri("   ")).toBeNull();
    expect(toFsPath("   ")).toBeNull();
    expect(toFsPath(":::not a uri:::")).toBeNull();
  });

  it("detects children without escaping via ..", () => {
    expect(isChildOf("/a/b/c.html", "/a/b")).toBe(true);
    expect(isChildOf("/a/b", "/a/b")).toBe(true);
    expect(isChildOf("/a/bc", "/a/b")).toBe(false);
    expect(isChildOf("/a/../a/b/x.html", "/a/b")).toBe(true);
  });

  it("extracts extensions and joins paths", () => {
    expect(extensionOf("base.HTML")).toBe(".html");
    expect(extensionOf("macro.jinja2")).toBe(".jinja2");
    expect(extensionOf("noext")).toBe("");
    expect(joinPath("/a/b", "../c")).toBe("/a/c");
  });
});
