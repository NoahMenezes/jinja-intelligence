import { describe, expect, it } from "vitest";
import { extractPythonSymbols } from "../../src/python/symbols.js";
import { attrsOf, resolveKwargType } from "../../src/python/types.js";

const SYMBOLS = extractPythonSymbols(`
@dataclass
class User:
    name: str
    email: str

class Admin(User):
    level: int

def get_user() -> User:
    return User(name="a", email="b")

def compute():
    return 1
`);

describe("python types", () => {
  it("resolves bare classes, construction, and annotated returns", () => {
    expect(resolveKwargType("User", SYMBOLS)).toMatchObject({ kind: "class", name: "User" });
    expect(resolveKwargType("User(name='a')", SYMBOLS)).toMatchObject({ kind: "class", name: "User" });
    expect(resolveKwargType("get_user()", SYMBOLS)).toMatchObject({ kind: "class", name: "User" });
    expect(resolveKwargType("str", SYMBOLS)).toMatchObject({ kind: "builtin", name: "str" });
  });

  it("merges base-class attributes", () => {
    const admin = resolveKwargType("Admin", SYMBOLS);
    expect([...attrsOf(admin)].sort()).toEqual(["email", "level", "name"]);
    expect(attrsOf(resolveKwargType("User", SYMBOLS))).toContain("email");
  });

  it("unwraps optionals, unions, and dotted names", () => {
    const withOptional = extractPythonSymbols("def f() -> Optional[User]:\n    return None\nclass User:\n    a: str\n");
    expect(resolveKwargType("f()", withOptional)).toMatchObject({ kind: "class", name: "User" });
    const symbols = extractPythonSymbols("import models\nclass X:\n    a: models.User\n");
    expect(resolveKwargType("X", symbols).kind).toBe("class");
  });

  it("falls back to unknown gracefully", () => {
    expect(resolveKwargType("compute()", SYMBOLS)).toEqual({ kind: "unknown" });
    expect(resolveKwargType("missing", SYMBOLS)).toEqual({ kind: "unknown" });
    expect(resolveKwargType("f(g())", SYMBOLS)).toEqual({ kind: "unknown" });
    expect(resolveKwargType("", SYMBOLS)).toEqual({ kind: "unknown" });
    expect(attrsOf({ kind: "unknown" })).toEqual([]);
    expect(attrsOf({ kind: "builtin", name: "str" })).toEqual([]);
  });
});
