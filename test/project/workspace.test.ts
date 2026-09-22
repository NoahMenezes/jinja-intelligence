import { describe, expect, it } from "vitest";
import { rootsFromInitialize } from "../../src/project/workspace.js";

describe("workspace", () => {
  it("prefers rootUri, then rootPath, then folders", () => {
    expect(rootsFromInitialize({ rootUri: "file:///a" })).toEqual(["file:///a"]);
    expect(rootsFromInitialize({ rootUri: null, rootPath: "/b" })).toEqual(["file:///b"]);
    expect(
      rootsFromInitialize({ rootUri: null, workspaceFolders: [{ uri: "file:///c" }, { uri: "file:///d" }] }),
    ).toEqual(["file:///c", "file:///d"]);
  });

  it("drops non-file schemes, blanks, and duplicates", () => {
    expect(
      rootsFromInitialize({
        rootUri: "file:///a",
        workspaceFolders: [{ uri: "file:///a" }, { uri: "untitled:x" }, { uri: "  " }],
      }),
    ).toEqual(["file:///a"]);
    expect(rootsFromInitialize({})).toEqual([]);
    expect(rootsFromInitialize(null as unknown as Record<string, unknown>)).toEqual([]);
  });
});
